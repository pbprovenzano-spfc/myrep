/* =========================================================
   Registry de páginas — e-mail de cobrança + adimplência
   Supabase (representantes) + fallback local data/paginas.json
   ========================================================= */

const fs = require("fs");
const path = require("path");
const { getSupabase, supabaseConfigured } = require("./supabase");

const DIAS_CARENCIA = 3;
const ARQ_LOCAL = path.join(__dirname, "..", "..", "data", "paginas.json");
const DIR_CLIENTES = path.join(__dirname, "..", "..", "clientes");

function normalizarEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  return e.includes("@") ? e.slice(0, 160) : "";
}

function normalizarSlug(slug) {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function lerLocal() {
  try {
    if (!fs.existsSync(ARQ_LOCAL)) return {};
    const raw = JSON.parse(fs.readFileSync(ARQ_LOCAL, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function escreverLocal(mapa) {
  fs.mkdirSync(path.dirname(ARQ_LOCAL), { recursive: true });
  fs.writeFileSync(ARQ_LOCAL, JSON.stringify(mapa, null, 2));
}

function registroPadrao(slug, patch = {}) {
  return {
    slug,
    email_cobranca: patch.email_cobranca ?? null,
    ativo: patch.ativo !== false,
    inadimplente_desde: patch.inadimplente_desde ?? null,
    controle_manual: patch.controle_manual === true,
    user_id: patch.user_id || null,
    nome: patch.nome || null,
    publicado: patch.publicado !== false,
    updated_at: patch.updated_at || new Date().toISOString()
  };
}

function diasDesde(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function aplicarRegraCarencia(reg) {
  const r = { ...reg };
  if (r.controle_manual) return r;
  const dias = diasDesde(r.inadimplente_desde);
  if (r.inadimplente_desde && dias != null && dias >= DIAS_CARENCIA) {
    r.ativo = false;
  }
  return r;
}

function situacaoDe(reg) {
  const r = aplicarRegraCarencia(reg);
  const base = {
    diasCarencia: DIAS_CARENCIA,
    controle_manual: r.controle_manual === true
  };
  if (!r.email_cobranca) {
    return {
      ...base,
      codigo: r.ativo === false ? "inativa" : "sem_email",
      label: r.ativo === false ? "Inativa" : "Sem e-mail",
      diasInadimplente: null,
      ativo: r.ativo !== false
    };
  }
  if (r.ativo === false) {
    return {
      ...base,
      codigo: "inativa",
      label: "Inativa",
      diasInadimplente: diasDesde(r.inadimplente_desde),
      ativo: false
    };
  }
  if (r.inadimplente_desde) {
    const dias = diasDesde(r.inadimplente_desde) || 0;
    return {
      ...base,
      codigo: "inadimplente",
      label: `Inadimplente (${dias} de ${DIAS_CARENCIA} dias)`,
      diasInadimplente: dias,
      ativo: true
    };
  }
  return {
    ...base,
    codigo: "adimplente",
    label: "Adimplente",
    diasInadimplente: null,
    ativo: true
  };
}

function listarSlugsLocais() {
  if (!fs.existsSync(DIR_CLIENTES)) return [];
  return fs
    .readdirSync(DIR_CLIENTES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const dados = JSON.parse(fs.readFileSync(path.join(DIR_CLIENTES, f), "utf8"));
        const slug = normalizarSlug(dados.slug || f.replace(/\.json$/i, ""));
        return {
          slug,
          nome: dados.nome || dados.empresa || slug,
          publicado: true
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function metaDeRow(slug, row = {}) {
  const nome = row.dados?.nome || row.dados?.empresa || row.nome || slug;
  return registroPadrao(slug, {
    email_cobranca: row.email_cobranca || null,
    ativo: row.ativo !== false,
    inadimplente_desde: row.inadimplente_desde || null,
    controle_manual: row.controle_manual === true,
    user_id: row.user_id || null,
    nome,
    publicado: row.publicado !== false,
    updated_at: row.updated_at
  });
}

async function obterMeta(slug) {
  const s = normalizarSlug(slug);
  if (!s) return null;

  if (supabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("representantes")
      .select(
        "slug, dados, publicado, email_cobranca, ativo, inadimplente_desde, controle_manual, user_id, updated_at"
      )
      .eq("slug", s)
      .maybeSingle();
    if (error) console.error("paginas obterMeta:", error.message);
    if (data) {
      return aplicarRegraCarencia(metaDeRow(s, data));
    }
  }

  const local = lerLocal()[s];
  if (!local) {
    return aplicarRegraCarencia(registroPadrao(s));
  }
  return aplicarRegraCarencia(metaDeRow(s, local));
}

async function salvarMeta(slug, patch) {
  const s = normalizarSlug(slug);
  if (!s) {
    throw Object.assign(new Error("Slug inválido."), { status: 400 });
  }

  const atual = (await obterMeta(s)) || registroPadrao(s);
  const proximo = registroPadrao(s, {
    ...atual,
    ...patch,
    slug: s,
    email_cobranca:
      patch.email_cobranca !== undefined
        ? normalizarEmail(patch.email_cobranca) || null
        : atual.email_cobranca,
    controle_manual:
      patch.controle_manual !== undefined
        ? patch.controle_manual === true
        : atual.controle_manual === true,
    updated_at: new Date().toISOString()
  });
  const final = aplicarRegraCarencia(proximo);

  if (supabaseConfigured()) {
    const sb = getSupabase();
    const { data: existente } = await sb
      .from("representantes")
      .select("id, dados, publicado")
      .eq("slug", s)
      .maybeSingle();

    if (existente) {
      const patch = {
        email_cobranca: final.email_cobranca,
        ativo: final.ativo !== false,
        inadimplente_desde: final.inadimplente_desde,
        controle_manual: final.controle_manual === true,
        updated_at: final.updated_at
      };
      if (final.user_id) patch.user_id = final.user_id;
      const { error } = await sb.from("representantes").update(patch).eq("slug", s);
      if (error) {
        console.error("paginas salvarMeta update:", error.message);
        throw Object.assign(new Error("Falha ao salvar página."), { status: 500 });
      }
    } else {
      const { error } = await sb.from("representantes").insert({
        slug: s,
        dados: { nome: final.nome || s, slug: s },
        publicado: false,
        email_cobranca: final.email_cobranca,
        ativo: final.ativo !== false,
        inadimplente_desde: final.inadimplente_desde,
        controle_manual: final.controle_manual === true,
        user_id: final.user_id || null,
        updated_at: final.updated_at
      });
      if (error) {
        console.error("paginas salvarMeta insert:", error.message);
        // fallback local
      } else {
        return final;
      }
    }
  }

  const mapa = lerLocal();
  mapa[s] = {
    email_cobranca: final.email_cobranca,
    ativo: final.ativo !== false,
    inadimplente_desde: final.inadimplente_desde,
    controle_manual: final.controle_manual === true,
    nome: final.nome || null,
    updated_at: final.updated_at
  };
  escreverLocal(mapa);
  return final;
}

async function associarEmailSeVazio(slug, email) {
  const e = normalizarEmail(email);
  const s = normalizarSlug(slug);
  if (!s || !e) return null;
  const atual = await obterMeta(s);
  if (atual?.email_cobranca) return atual;
  return salvarMeta(s, { email_cobranca: e });
}

async function marcarAdimplentePorEmail(email) {
  const e = normalizarEmail(email);
  if (!e) return [];
  const lista = await listarPaginas();
  const afetadas = [];
  for (const p of lista) {
    if (p.email_cobranca !== e) continue;
    const patch = { inadimplente_desde: null };
    if (!p.controle_manual) patch.ativo = true;
    const atualizado = await salvarMeta(p.slug, patch);
    afetadas.push(atualizado);
  }
  return afetadas;
}

async function marcarInadimplentePorEmail(email) {
  const e = normalizarEmail(email);
  if (!e) return [];
  const lista = await listarPaginas();
  const afetadas = [];
  const agora = new Date().toISOString();
  for (const p of lista) {
    if (p.email_cobranca !== e) continue;
    const patch = {};
    if (!p.inadimplente_desde) patch.inadimplente_desde = agora;
    const atualizado = await salvarMeta(p.slug, patch);
    afetadas.push(atualizado);
  }
  return afetadas;
}

function precisaDesativarPorCarencia(reg) {
  if (!reg || reg.controle_manual) return false;
  if (!reg.inadimplente_desde) return false;
  if (reg.ativo === false) return false;
  const dias = diasDesde(reg.inadimplente_desde);
  return dias != null && dias >= DIAS_CARENCIA;
}

async function listarPaginas() {
  const porSlug = new Map();

  for (const c of listarSlugsLocais()) {
    porSlug.set(c.slug, {
      slug: c.slug,
      nome: c.nome,
      publicado: true
    });
  }

  if (supabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("representantes")
      .select(
        "slug, dados, publicado, email_cobranca, ativo, inadimplente_desde, controle_manual, user_id, updated_at"
      )
      .order("slug");
    if (error) console.error("paginas listar:", error.message);
    for (const row of data || []) {
      const slug = normalizarSlug(row.slug);
      const base = porSlug.get(slug) || { slug, nome: slug, publicado: true };
      porSlug.set(slug, {
        ...base,
        nome: row.dados?.nome || row.dados?.empresa || base.nome,
        publicado: row.publicado !== false,
        email_cobranca: row.email_cobranca || null,
        ativo: row.ativo !== false,
        inadimplente_desde: row.inadimplente_desde || null,
        controle_manual: row.controle_manual === true,
        user_id: row.user_id || null,
        updated_at: row.updated_at
      });
    }
  }

  const local = lerLocal();
  for (const [slug, meta] of Object.entries(local)) {
    const s = normalizarSlug(slug);
    const base = porSlug.get(s) || { slug: s, nome: meta.nome || s, publicado: true };
    porSlug.set(s, {
      ...base,
      email_cobranca: base.email_cobranca || meta.email_cobranca || null,
      ativo: meta.ativo !== undefined ? meta.ativo !== false : base.ativo !== false,
      inadimplente_desde:
        base.inadimplente_desde || meta.inadimplente_desde || null,
      controle_manual:
        meta.controle_manual === true || base.controle_manual === true,
      user_id: base.user_id || meta.user_id || null,
      nome: base.nome || meta.nome || s,
      updated_at: meta.updated_at || base.updated_at
    });
  }

  const saida = [];
  for (const raw of porSlug.values()) {
    let reg = aplicarRegraCarencia(registroPadrao(raw.slug, raw));
    if (precisaDesativarPorCarencia(raw)) {
      reg = await salvarMeta(raw.slug, {
        ativo: false,
        inadimplente_desde: raw.inadimplente_desde
      });
    }
    const situacao = situacaoDe(reg);
    saida.push({
      ...reg,
      situacao: situacao.codigo,
      situacaoLabel: situacao.label,
      diasInadimplente: situacao.diasInadimplente,
      diasCarencia: DIAS_CARENCIA,
      controle_manual: reg.controle_manual === true
    });
  }

  saida.sort((a, b) => a.slug.localeCompare(b.slug, "pt-BR"));
  return saida;
}

async function paginaAtiva(slug) {
  const s = normalizarSlug(slug);
  if (!s) return true;
  const meta = await obterMeta(s);
  if (!meta) return true;
  const reg = aplicarRegraCarencia(meta);
  if (precisaDesativarPorCarencia(meta)) {
    await salvarMeta(s, { ativo: false, inadimplente_desde: reg.inadimplente_desde });
    return false;
  }
  return reg.ativo !== false;
}

function resumirPaginas(paginas) {
  const lista = Array.isArray(paginas) ? paginas : [];
  const out = {
    total: lista.length,
    ativas: 0,
    inadimplentes: 0,
    inativas: 0,
    semEmail: 0,
    controleManual: 0
  };
  for (const p of lista) {
    if (p.controle_manual) out.controleManual += 1;
    if (p.situacao === "inadimplente") out.inadimplentes += 1;
    else if (p.situacao === "inativa") out.inativas += 1;
    else if (p.situacao === "sem_email") out.semEmail += 1;
    if (p.ativo !== false) out.ativas += 1;
  }
  return out;
}

module.exports = {
  DIAS_CARENCIA,
  normalizarEmail,
  normalizarSlug,
  obterMeta,
  salvarMeta,
  associarEmailSeVazio,
  marcarAdimplentePorEmail,
  marcarInadimplentePorEmail,
  listarPaginas,
  paginaAtiva,
  situacaoDe,
  diasDesde,
  resumirPaginas,
  precisaDesativarPorCarencia
};
