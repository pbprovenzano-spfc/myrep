/* =========================================================
   Registry de páginas — e-mail de cobrança + adimplência
   Supabase (representantes) + fallback local data/paginas.json
   ========================================================= */

const fs = require("fs");
const path = require("path");
const { getSupabase, supabaseConfigured } = require("./supabase");
const { slugValido } = require("./slugs");

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

function aplicarMetaLocal(porSlug, local) {
  for (const [slug, meta] of Object.entries(local)) {
    const s = normalizarSlug(slug);
    if (!porSlug.has(s)) continue;
    const base = porSlug.get(s);
    porSlug.set(s, {
      ...base,
      email_cobranca: base.email_cobranca || meta.email_cobranca || null,
      ativo: meta.ativo !== undefined ? meta.ativo !== false : base.ativo !== false,
      inadimplente_desde: base.inadimplente_desde || meta.inadimplente_desde || null,
      controle_manual: meta.controle_manual === true || base.controle_manual === true,
      user_id: base.user_id || meta.user_id || null,
      nome: base.nome || meta.nome || s,
      updated_at: meta.updated_at || base.updated_at
    });
  }
}

async function listarPaginas() {
  const porSlug = new Map();
  const local = lerLocal();

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
      porSlug.set(slug, {
        slug,
        nome: row.dados?.nome || row.dados?.empresa || slug,
        publicado: row.publicado !== false,
        email_cobranca: row.email_cobranca || null,
        ativo: row.ativo !== false,
        inadimplente_desde: row.inadimplente_desde || null,
        controle_manual: row.controle_manual === true,
        user_id: row.user_id || null,
        updated_at: row.updated_at
      });
    }
    aplicarMetaLocal(porSlug, local);
  } else {
    for (const c of listarSlugsLocais()) {
      porSlug.set(c.slug, {
        slug: c.slug,
        nome: c.nome,
        publicado: true
      });
    }
    for (const [slug, meta] of Object.entries(local)) {
      const s = normalizarSlug(slug);
      const base = porSlug.get(s) || { slug: s, nome: meta.nome || s, publicado: true };
      porSlug.set(s, {
        ...base,
        email_cobranca: base.email_cobranca || meta.email_cobranca || null,
        ativo: meta.ativo !== undefined ? meta.ativo !== false : base.ativo !== false,
        inadimplente_desde: base.inadimplente_desde || meta.inadimplente_desde || null,
        controle_manual: meta.controle_manual === true || base.controle_manual === true,
        user_id: base.user_id || meta.user_id || null,
        nome: base.nome || meta.nome || s,
        updated_at: meta.updated_at || base.updated_at
      });
    }
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

function assetsBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || "assets-clientes";
}

async function listarArquivosStorage(prefixo) {
  const sb = getSupabase();
  const bucket = assetsBucket();
  const saida = [];

  async function walk(caminho) {
    const { data, error } = await sb.storage.from(bucket).list(caminho, { limit: 1000 });
    if (error) {
      throw Object.assign(new Error(`Falha ao listar arquivos: ${error.message}`), { status: 500 });
    }
    for (const item of data || []) {
      const rel = caminho ? `${caminho}/${item.name}` : item.name;
      if (item.id == null) {
        await walk(rel);
      } else {
        saida.push(rel);
      }
    }
  }

  await walk(prefixo);
  return saida;
}

function erroStorageIgnoravel(msg) {
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("not found") ||
    m.includes("does not exist") ||
    m.includes("no such") ||
    m.includes("already exists") ||
    m.includes("duplicate") ||
    m.includes("resource already exists")
  );
}

async function reverterAssetsSlug(movidos) {
  if (!movidos.length || !supabaseConfigured()) return;
  const sb = getSupabase();
  const bucket = assetsBucket();
  for (const { de, para } of [...movidos].reverse()) {
    const { error } = await sb.storage.from(bucket).move(para, de);
    if (error) console.error("reverterAssetsSlug:", error.message);
  }
}

async function moverAssetsSlug(antigo, novo) {
  if (!supabaseConfigured()) return [];
  const sb = getSupabase();
  const bucket = assetsBucket();
  let arquivos = [];
  try {
    arquivos = await listarArquivosStorage(antigo);
  } catch (erro) {
    if (erroStorageIgnoravel(erro.message)) {
      return [];
    }
    console.error("moverAssetsSlug:", erro.message || erro);
    throw erro;
  }
  if (!arquivos.length) return [];

  const movidos = [];
  for (const caminho of arquivos) {
    const rel = caminho.startsWith(`${antigo}/`) ? caminho.slice(antigo.length + 1) : caminho;
    const destino = `${novo}/${rel}`;
    const { error } = await sb.storage.from(bucket).move(caminho, destino);
    if (error) {
      if (erroStorageIgnoravel(error.message)) {
        await sb.storage.from(bucket).remove([caminho]);
        movidos.push({ de: caminho, para: destino });
        continue;
      }
      console.error("moverAssetsSlug move:", error.message);
      await reverterAssetsSlug(movidos);
      throw Object.assign(new Error("Falha ao mover arquivos da página."), { status: 500 });
    }
    movidos.push({ de: caminho, para: destino });
  }
  return movidos;
}

async function renomearSlug(antigoBruto, novoBruto) {
  const antigo = normalizarSlug(antigoBruto);
  const val = slugValido(novoBruto);
  if (!antigo) {
    throw Object.assign(new Error("Slug atual inválido."), { status: 400 });
  }
  if (!val.ok) {
    throw Object.assign(new Error(val.motivo || "Novo slug inválido."), { status: 400 });
  }
  const novo = val.slug;
  if (antigo === novo) {
    throw Object.assign(new Error("O novo endereço é igual ao atual."), { status: 400 });
  }
  if (!supabaseConfigured()) {
    throw Object.assign(new Error("Supabase não configurado."), { status: 503 });
  }

  const sb = getSupabase();
  const sel =
    "id, slug, dados, publicado, email_cobranca, ativo, inadimplente_desde, controle_manual, user_id, updated_at";

  const { data: rowNovo, error: errNovo } = await sb
    .from("representantes")
    .select(sel)
    .eq("slug", novo)
    .maybeSingle();
  if (errNovo) {
    console.error("renomearSlug select novo:", errNovo.message);
    throw Object.assign(new Error("Falha ao buscar página."), { status: 500 });
  }

  const { data: row, error: errRow } = await sb.from("representantes").select(sel).eq("slug", antigo).maybeSingle();
  if (errRow) {
    console.error("renomearSlug select:", errRow.message);
    throw Object.assign(new Error("Falha ao buscar página."), { status: 500 });
  }

  if (!row) {
    if (rowNovo) {
      const meta = aplicarRegraCarencia(metaDeRow(novo, rowNovo));
      const situacao = situacaoDe(meta);
      return {
        ...meta,
        situacao: situacao.codigo,
        situacaoLabel: situacao.label,
        diasInadimplente: situacao.diasInadimplente,
        diasCarencia: DIAS_CARENCIA
      };
    }
    throw Object.assign(new Error("Página não encontrada."), { status: 404 });
  }

  if (rowNovo && rowNovo.id !== row.id) {
    throw Object.assign(new Error("Este endereço já está em uso."), { status: 409 });
  }

  const movidos = await moverAssetsSlug(antigo, novo);

  const dados = row.dados && typeof row.dados === "object" ? { ...row.dados } : {};
  dados.slug = novo;

  const { data: atualizado, error: errUp } = await sb
    .from("representantes")
    .update({
      slug: novo,
      dados,
      updated_at: new Date().toISOString()
    })
    .eq("slug", antigo)
    .select()
    .single();
  if (errUp) {
    console.error("renomearSlug update:", errUp.message);
    await reverterAssetsSlug(movidos);
    throw Object.assign(new Error("Falha ao atualizar slug no banco."), { status: 500 });
  }

  const { error: errMsg } = await sb.from("mensagens").update({ slug: novo }).eq("slug", antigo);
  if (errMsg) console.error("renomearSlug mensagens:", errMsg.message);

  const mapa = lerLocal();
  if (mapa[antigo]) {
    mapa[novo] = {
      ...mapa[antigo],
      slug: novo,
      updated_at: new Date().toISOString()
    };
    delete mapa[antigo];
    escreverLocal(mapa);
  }

  const meta = aplicarRegraCarencia(metaDeRow(novo, atualizado));
  const situacao = situacaoDe(meta);
  return {
    ...meta,
    situacao: situacao.codigo,
    situacaoLabel: situacao.label,
    diasInadimplente: situacao.diasInadimplente,
    diasCarencia: DIAS_CARENCIA
  };
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
  precisaDesativarPorCarencia,
  renomearSlug
};
