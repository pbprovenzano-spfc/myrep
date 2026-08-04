/* =========================================================
   build.js — gerador estático do My Rep
   Lê /clientes/*.json e escreve /dist pronto para publicar.
   Sem dependências: só Node.
   ========================================================= */

const fs = require("fs");
const path = require("path");

const RAIZ = __dirname;
const DIR_CLIENTES = path.join(RAIZ, "clientes");
const DIR_TEMPLATE = path.join(RAIZ, "template");
const DIR_PUBLICO = path.join(RAIZ, "publico");
const DIR_ASSETS = path.join(RAIZ, "assets-clientes");
const DIR_GEO = path.join(RAIZ, "geo");
const DIST = path.join(RAIZ, "dist");

const OBRIGATORIOS = ["slug", "nome", "whatsapp"];

const PALETA_PADRAO = "ambar";

const PALETAS = {
  ambar: {
    "--ink": "#0A1620",
    "--ink-soft": "#1A3040",
    "--papel": "#F2F5F7",
    "--sinal": "#F0A202",
    "--sinal-escuro": "#D48C00",
    "--borda": "#D5E0E6",
    "--mutado": "#5C7382",
    "--texto": "#243844",
    "--sinal-rgb": "240, 162, 2"
  },
  oceano: {
    "--ink": "#0A1F2E",
    "--ink-soft": "#163A52",
    "--papel": "#EEF4F7",
    "--sinal": "#1AA6B8",
    "--sinal-escuro": "#148A99",
    "--borda": "#C9D8E0",
    "--mutado": "#5A7384",
    "--texto": "#1E3544",
    "--sinal-rgb": "26, 166, 184"
  },
  floresta: {
    "--ink": "#0F1F14",
    "--ink-soft": "#1A3322",
    "--papel": "#F0F5F1",
    "--sinal": "#2F9E5B",
    "--sinal-escuro": "#24804A",
    "--borda": "#C9D9CE",
    "--mutado": "#5C7564",
    "--texto": "#24382C",
    "--sinal-rgb": "47, 158, 91"
  },
  rubi: {
    "--ink": "#1A1214",
    "--ink-soft": "#2E1E22",
    "--papel": "#F6F1F2",
    "--sinal": "#C44B3A",
    "--sinal-escuro": "#A33C2E",
    "--borda": "#E0D4D5",
    "--mutado": "#7A6366",
    "--texto": "#3A282A",
    "--sinal-rgb": "196, 75, 58"
  },
  ardosia: {
    "--ink": "#1C1F24",
    "--ink-soft": "#2C323A",
    "--papel": "#F3F3F5",
    "--sinal": "#C47A3A",
    "--sinal-escuro": "#A5642E",
    "--borda": "#D6D8DC",
    "--mutado": "#6B7078",
    "--texto": "#2E333A",
    "--sinal-rgb": "196, 122, 58"
  }
};

const NOME_UF = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins"
};

/* ---------------- utilidades ---------------- */

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const temItens = (a) => Array.isArray(a) && a.length > 0;
const temTexto = (s) => typeof s === "string" && s.trim() !== "";

const normalizar = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function resolverPaleta(c) {
  const bruto = temTexto(c.paleta) ? c.paleta.trim().toLowerCase() : PALETA_PADRAO;
  if (!PALETAS[bruto]) {
    console.error(`  ▸ ${c.__arquivo || c.slug}: paleta "${c.paleta}" inválida — usando ${PALETA_PADRAO}`);
    return { id: PALETA_PADRAO, vars: PALETAS[PALETA_PADRAO] };
  }
  return { id: bruto, vars: PALETAS[bruto] };
}

function cssPaleta(paleta) {
  const linhas = Object.entries(paleta.vars)
    .map(([chave, valor]) => `  ${chave}: ${valor};`)
    .join("\n");
  return `<style>\n:root {\n${linhas}\n}\n</style>`;
}

function copiarPasta(origem, destino) {
  if (!fs.existsSync(origem)) return;
  fs.mkdirSync(destino, { recursive: true });
  for (const item of fs.readdirSync(origem)) {
    const de = path.join(origem, item);
    const para = path.join(destino, item);
    if (fs.statSync(de).isDirectory()) copiarPasta(de, para);
    else fs.copyFileSync(de, para);
  }
}

function lerGeo(arquivo) {
  const caminho = path.join(DIR_GEO, arquivo);
  if (!fs.existsSync(caminho)) return null;
  try {
    return JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch {
    return null;
  }
}

/* ---------------- leitura e validação ---------------- */

function lerClientes() {
  if (!fs.existsSync(DIR_CLIENTES)) {
    console.error("  Pasta /clientes não encontrada.");
    return [];
  }

  const arquivos = fs.readdirSync(DIR_CLIENTES).filter((f) => f.endsWith(".json"));
  const validos = [];

  for (const arquivo of arquivos) {
    const caminho = path.join(DIR_CLIENTES, arquivo);
    let dados;

    try {
      dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
    } catch (erro) {
      console.error(`  ✕ ${arquivo}: JSON inválido — ${erro.message}`);
      continue;
    }

    const faltando = OBRIGATORIOS.filter((campo) => !temTexto(dados[campo]));
    if (faltando.length) {
      console.error(`  ✕ ${arquivo}: falta ${faltando.join(", ")} — cliente ignorado`);
      continue;
    }

    if (!/^[a-z0-9-]+$/.test(dados.slug)) {
      console.error(`  ✕ ${arquivo}: slug "${dados.slug}" deve ter só letras minúsculas, números e hífen`);
      continue;
    }

    const duplicado = validos.find((c) => c.slug === dados.slug);
    if (duplicado) {
      console.error(`  ✕ ${arquivo}: slug "${dados.slug}" já usado — cliente ignorado`);
      continue;
    }

    dados.__arquivo = arquivo;
    validos.push(dados);
  }

  return validos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function validarCliente(dados, arquivo) {
  const faltando = OBRIGATORIOS.filter((campo) => !temTexto(dados[campo]));
  if (faltando.length) {
    console.error(`  ✕ ${arquivo}: falta ${faltando.join(", ")} — cliente ignorado`);
    return null;
  }
  if (!/^[a-z0-9-]+$/.test(dados.slug)) {
    console.error(`  ✕ ${arquivo}: slug "${dados.slug}" inválido — cliente ignorado`);
    return null;
  }
  return dados;
}

async function lerClientesSupabase() {
  const { getSupabase, supabaseConfigured } = require("./api/_lib/supabase");
  if (!supabaseConfigured()) return null;

  const sb = getSupabase();
  const { data, error } = await sb
    .from("representantes")
    .select("slug, dados")
    .eq("publicado", true);

  if (error) {
    console.error(`  Supabase: ${error.message} — usando clientes/ local`);
    return null;
  }

  const validos = [];
  const slugs = new Set();
  for (const row of data || []) {
    const dados = { ...(row.dados || {}), slug: row.slug || row.dados?.slug };
    const ok = validarCliente(dados, row.slug);
    if (!ok) continue;
    if (slugs.has(ok.slug)) {
      console.error(`  ✕ slug duplicado "${ok.slug}" no Supabase — ignorado`);
      continue;
    }
    slugs.add(ok.slug);
    ok.__arquivo = `${ok.slug}.json`;
    ok.__fromSupabase = true;
    validos.push(ok);
  }

  if (!validos.length) {
    console.warn("  Supabase: nenhum representante publicado — tentando clientes/ local");
    return null;
  }

  console.log(`  ▸ ${validos.length} representante(s) do Supabase`);
  return validos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function lerClientesAsync() {
  carregarEnvBuild();
  const doSupabase = await lerClientesSupabase();
  if (doSupabase) return { clientes: doSupabase, origem: "supabase" };
  return { clientes: lerClientes(), origem: "local" };
}

/* ---------------- blocos da página ---------------- */

let _assetsModo = "local";

function caminhoAsset(slug, arquivo) {
  if (!arquivo) return "";
  if (_assetsModo === "storage") {
    const { storagePublicUrl } = require("./api/_lib/supabase");
    return storagePublicUrl(slug, arquivo);
  }
  return `/assets-clientes/${slug}/${arquivo}`;
}

function blocoMarcas(c) {
  if (!temItens(c.marcas)) return "";
  const itens = c.marcas.map((m) =>
    m.logo
      ? `        <li class="marca-chip"><img src="${caminhoAsset(c.slug, m.logo)}" alt="${esc(m.nome)}" loading="lazy"></li>`
      : `        <li class="marca-chip"><span class="marca-chip__nome">${esc(m.nome)}</span></li>`
  ).join("\n");

  return `  <section class="bloco bloco--marcas">
    <h2 class="rotulo">Marcas</h2>
    <ul class="marcas">
${itens}
    </ul>
  </section>`;
}

/** Normaliza `cidades`: array (1 UF) ou objeto { BA: [...] }. */
function normalizarCidades(cidades, estados) {
  const porUf = {};
  for (const uf of estados) porUf[uf] = [];

  if (Array.isArray(cidades)) {
    if (estados.length === 1) porUf[estados[0]] = cidades.filter(temTexto);
    return porUf;
  }

  if (cidades && typeof cidades === "object") {
    for (const [uf, lista] of Object.entries(cidades)) {
      const chave = String(uf).toUpperCase();
      if (!porUf[chave]) continue;
      porUf[chave] = Array.isArray(lista) ? lista.filter(temTexto) : [];
    }
  }

  return porUf;
}

/** Extrai pontos de um path SVG gerado pelo geo (M/L x y). */
function pontosDoPath(d) {
  const pts = [];
  const re = /[ML]\s*([-\d.]+)\s+([-\d.]+)/g;
  let m;
  while ((m = re.exec(d))) pts.push([Number(m[1]), Number(m[2])]);
  return pts;
}

/** Centroide aproximado (média dos pontos — suficiente para posicionar pinos). */
function centroidePath(d) {
  const pts = pontosDoPath(d);
  if (!pts.length) return null;
  let x = 0;
  let y = 0;
  for (const [px, py] of pts) {
    x += px;
    y += py;
  }
  return [Math.round((x / pts.length) * 10) / 10, Math.round((y / pts.length) * 10) / 10];
}

function pinSvg(x, y, escala) {
  const s = escala == null ? 1 : escala;
  return `      <g class="mapa__pin" transform="translate(${x} ${y}) scale(${s})" aria-hidden="true">
        <path class="mapa__pin-corpo" d="M0 0C0 0-11-14-11-22C-11-28-6-33 0-33C6-33 11-28 11-22C11-14 0 0 0 0Z"/>
        <circle class="mapa__pin-olho" cx="0" cy="-22" r="4.2"/>
      </g>`;
}

let _mapaGlowSeq = 0;

function montarSvgMapa(mapa, ativas, titulo, { clicavel = false, glow = PALETAS[PALETA_PADRAO]["--sinal"] } = {}) {
  const totalAreas = Object.keys(mapa.areas).length;
  const pintarTudo = ativas.size > 0 && ativas.size === totalAreas;
  const glowId = "mapa-glow-" + (++_mapaGlowSeq);
  const corGlow = esc(glow);

  const paths = Object.entries(mapa.areas).map(([id, area]) => {
    const isAtiva = ativas.has(id);
    const cls = isAtiva ? " mapa__area--ativa" : "";
    const dataUf = clicavel && isAtiva ? ` data-uf="${esc(id)}"` : "";
    const foco = clicavel && isAtiva
      ? ` tabindex="0" role="button" aria-label="${esc(NOME_UF[id] || id)}"`
      : ' aria-hidden="true"';
    return `      <path class="mapa__area${cls}" d="${area.path}" data-id="${esc(id)}"${dataUf}${foco}></path>`;
  }).join("\n");

  const pinEscala = clicavel ? 1.15 : (ativas.size > 8 ? 0.7 : ativas.size > 3 ? 0.9 : 1.05);

  let pins = "";
  if (pintarTudo && !clicavel) {
    // Estado inteiro: um único pin no centro da malha
    const todosPts = [];
    for (const id of ativas) {
      const area = mapa.areas[id];
      if (area) todosPts.push(...pontosDoPath(area.path));
    }
    if (todosPts.length) {
      let x = 0;
      let y = 0;
      for (const [px, py] of todosPts) {
        x += px;
        y += py;
      }
      pins = pinSvg(
        Math.round((x / todosPts.length) * 10) / 10,
        Math.round((y / todosPts.length) * 10) / 10,
        1.25
      );
    }
  } else {
    pins = [...ativas].map((id) => {
      const area = mapa.areas[id];
      if (!area) return "";
      const c = centroidePath(area.path);
      if (!c) return "";
      return pinSvg(c[0], c[1], pinEscala);
    }).filter(Boolean).join("\n");
  }

  return `      <div class="mapa-wrap">
        <svg class="mapa" viewBox="${esc(mapa.viewBox)}" role="img" aria-label="${esc(titulo)}">
          <title>${esc(titulo)}</title>
          <defs>
            <filter id="${glowId}" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="${corGlow}" flood-opacity="0.55"/>
              <feDropShadow dx="0" dy="0" stdDeviation="22" flood-color="${corGlow}" flood-opacity="0.28"/>
            </filter>
          </defs>
          <g class="mapa__silhueta" filter="url(#${glowId})">
${paths}
          </g>
          <g class="mapa__pins">
${pins}
          </g>
        </svg>
      </div>`;
}

function legendaEscrita(itens) {
  const lis = itens.map((nome) => `          <li>${esc(nome)}</li>`).join("\n");
  return `      <div class="mapa__chave" aria-hidden="true">
        <span class="mapa__chave-pin" aria-hidden="true"></span>
        Área atendida
      </div>
      <ul class="mapa__legenda">
${lis}
      </ul>`;
}

function fallbackUfs(estados) {
  return `      <ul class="ufs">${estados.map((uf) => `<li>${esc(uf)}</li>`).join("")}</ul>`;
}

function resolverEstado(uf, cidades, arquivo, glow) {
  const mapa = lerGeo(`uf-${uf}.json`);
  if (!mapa) {
    console.error(`  ▸ ${arquivo}: falta geo/uf-${uf}.json — rode npm run geo`);
    return { html: fallbackUfs([uf]), legenda: [NOME_UF[uf] || uf] };
  }

  const porNome = new Map();
  for (const [id, area] of Object.entries(mapa.areas)) {
    porNome.set(normalizar(area.nome), { id, nome: area.nome });
  }

  let ativas = new Set();
  let legenda = [];

  if (temItens(cidades)) {
    for (const cidade of cidades) {
      const hit = porNome.get(normalizar(cidade));
      if (!hit) {
        console.error(`  ✕ ${arquivo}: cidade "${cidade}" não encontrada em ${uf}`);
        continue;
      }
      ativas.add(hit.id);
      legenda.push(hit.nome);
    }
    if (!ativas.size) {
      ativas = new Set(Object.keys(mapa.areas));
      legenda = [NOME_UF[uf] || uf];
    }
  } else {
    ativas = new Set(Object.keys(mapa.areas));
    legenda = [NOME_UF[uf] || uf];
  }

  const titulo = `Mapa de ${NOME_UF[uf] || uf} — municípios atendidos`;
  return {
    html: montarSvgMapa(mapa, ativas, titulo, { glow }),
    legenda
  };
}

function painelBrasil(estados, arquivo, glow) {
  const mapa = lerGeo("brasil-uf.json");
  if (!mapa) {
    console.error(`  ▸ ${arquivo}: falta geo/brasil-uf.json — rode npm run geo`);
    return `    <div class="mapa-painel" data-vista="brasil">
${fallbackUfs(estados)}
${legendaEscrita(estados.map((uf) => NOME_UF[uf] || uf))}
    </div>`;
  }

  const ativas = new Set(estados);
  const legenda = estados.map((uf) => NOME_UF[uf] || uf);
  const titulo = "Mapa do Brasil — clique em um estado atendido";

  return `    <div class="mapa-painel mapa-painel--brasil" data-vista="brasil">
      <p class="mapa__dica">Clique em um estado para ver as cidades</p>
${montarSvgMapa(mapa, ativas, titulo, { clicavel: true, glow })}
${legendaEscrita(legenda)}
    </div>`;
}

function painelUf(uf, cidades, arquivo, { oculto = false, glow } = {}) {
  const resultado = resolverEstado(uf, cidades, arquivo, glow);
  const hidden = oculto ? " hidden" : "";
  return `    <div class="mapa-painel mapa-painel--uf" data-vista="${esc(uf)}"${hidden}>
      <p class="mapa__dica">${esc(NOME_UF[uf] || uf)}</p>
${resultado.html}
${legendaEscrita(resultado.legenda)}
    </div>`;
}

function blocoAtuacao(c) {
  if (!temItens(c.estados) && !temTexto(c.segmentos)) return "";

  const arquivo = c.__arquivo || c.slug + ".json";
  const glow = resolverPaleta(c).vars["--sinal"];
  let corpo = "";

  if (temItens(c.estados)) {
    const estados = c.estados.map((uf) => String(uf).toUpperCase());
    const porUf = normalizarCidades(c.cidades, estados);

    if (estados.length === 1) {
      corpo = painelUf(estados[0], porUf[estados[0]], arquivo, { oculto: false, glow });
    } else {
      const paineisUf = estados
        .map((uf) => painelUf(uf, porUf[uf], arquivo, { oculto: true, glow }))
        .join("\n");
      corpo = `${painelBrasil(estados, arquivo, glow)}
${paineisUf}
    <button type="button" class="mapa__voltar" hidden>← Estados</button>`;
    }
  }

  const seg = temTexto(c.segmentos)
    ? `    <p class="segmentos">${esc(c.segmentos)}</p>`
    : "";

  const drill = temItens(c.estados) && c.estados.length > 1 ? ' data-mapa="drill"' : "";

  return `  <section class="bloco bloco--atuacao"${drill}>
    <h2 class="rotulo">Atuação</h2>
    <div class="mapa-stack">
${[corpo, seg].filter(Boolean).join("\n")}
    </div>
  </section>`;
}

function blocoCatalogos(c) {
  if (!temItens(c.catalogos)) return "";
  const itens = c.catalogos.map((cat) => {
    const meta = cat.logo
      ? `<img class="link-btn__logo" src="${caminhoAsset(c.slug, cat.logo)}" alt="" loading="lazy">`
      : `<span class="link-btn__meta">${esc(cat.tipo || "PDF")}</span>`;

    return `        <li>
          <a class="link-btn" href="${caminhoAsset(c.slug, cat.arquivo)}" target="_blank" rel="noopener">
            <span class="link-btn__texto">${esc(cat.titulo || "Catálogo")}</span>
            ${meta}
          </a>
        </li>`;
  }).join("\n");

  return `  <section class="bloco bloco--links">
    <h2 class="rotulo">Catálogos</h2>
    <ul class="links">
${itens}
    </ul>
  </section>`;
}

function blocoContatos(c) {
  if (!temItens(c.contatos)) return "";
  const itens = c.contatos.map((ct) => {
    const externo = /^https?:/.test(ct.link || "") ? ' target="_blank" rel="noopener"' : "";
    return `        <li>
          <a class="link-btn" href="${esc(ct.link || "#")}"${externo}>
            <span class="link-btn__texto">${esc(ct.canal)}</span>
            <span class="link-btn__meta">${esc(ct.valor)}</span>
          </a>
        </li>`;
  }).join("\n");

  return `  <section class="bloco bloco--links">
    <h2 class="rotulo">Contato</h2>
    <ul class="links">
${itens}
    </ul>
  </section>`;
}

function botaoZap(c) {
  const numero = String(c.whatsapp).replace(/\D/g, "");
  if (!numero) return "";
  const msg = temTexto(c.mensagemWhatsapp) ? "?text=" + encodeURIComponent(c.mensagemWhatsapp) : "";
  return `<a class="link-btn link-btn--destaque" href="https://wa.me/${numero}${msg}" target="_blank" rel="noopener">
      <span class="link-btn__icone" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.15-1.18-.06-.11-.23-.17-.48-.29Z"/></svg>
      </span>
      <span class="link-btn__texto">Falar no WhatsApp</span>
    </a>`;
}

function gerarFichas(clientes) {
  return clientes.map((c) => {
    const marcas = temItens(c.marcas) ? c.marcas.map((m) => m.nome).join(" ") : "";
    const estados = temItens(c.estados) ? c.estados.join(" ") : "";
    const chaves = [c.nome, c.empresa, marcas, estados, c.segmentos || "", c.cargo || ""]
      .join(" ")
      .toLowerCase();

    const ufs = temItens(c.estados)
      ? `<ul class="ufs ufs--mini">${c.estados.map((uf) => `<li>${esc(uf)}</li>`).join("")}</ul>`
      : "";
    const marcasTexto = temItens(c.marcas)
      ? `<p class="ficha__marcas">${esc(c.marcas.map((m) => m.nome).join(" · "))}</p>`
      : "";
    const fotoClasse = c.fotoTipo === "logo" ? "ficha__foto ficha__foto--logo" : "ficha__foto";

    return `      <li class="ficha" data-busca="${esc(chaves)}">
        <a class="ficha__link" href="/${esc(c.slug)}/">
          <img class="${fotoClasse}" src="${caminhoAsset(c.slug, c.foto)}" alt="" width="52" height="52" loading="lazy">
          <div class="ficha__texto">
            <p class="ficha__nome">${esc(c.nome)}</p>
            <p class="ficha__cargo">${esc(c.segmentos || c.cargo || "")}</p>
            ${marcasTexto}
          </div>
          ${ufs}
        </a>
      </li>`;
  }).join("\n");
}

/* ---------------- páginas ---------------- */

function gerarPagina(c, template) {
  const paleta = resolverPaleta(c);
  const blocos = [blocoMarcas(c), blocoAtuacao(c), blocoCatalogos(c), blocoContatos(c)]
    .filter(Boolean)
    .join("\n\n");

  const destaqueEmpresa = c.destaque === "empresa" && temTexto(c.empresa);
  const tituloPrincipal = destaqueEmpresa ? c.empresa : c.nome;
  const tituloSecundario = destaqueEmpresa ? c.nome : c.empresa;
  const titulo = [tituloPrincipal, tituloSecundario].filter(Boolean).join(" — ");
  const bio = temTexto(c.bio) ? `<p class="capa__bio">${esc(c.bio)}</p>` : "";
  const linhaSecundaria = temTexto(tituloSecundario)
    ? `<p class="capa__empresa${destaqueEmpresa ? " capa__empresa--abaixo" : ""}">${esc(tituloSecundario)}</p>`
    : "";
  // Pessoa em evidência: empresa acima. Empresa em evidência: nome da pessoa abaixo.
  const antesNome = destaqueEmpresa ? "" : linhaSecundaria;
  const depoisNome = destaqueEmpresa ? linhaSecundaria : "";
  const cargo = temTexto(c.cargo) ? `<p class="capa__cargo">${esc(c.cargo)}</p>` : "";
  const fotoClasse = c.fotoTipo === "logo" ? "capa__foto capa__foto--logo" : "capa__foto";
  const altFoto = destaqueEmpresa
    ? `Logo ou foto de ${c.empresa}`
    : `Foto de ${c.nome}`;

  return template
    .replace(/\{\{TITULO\}\}/g, esc(titulo))
    .replace(/\{\{DESCRICAO\}\}/g, esc(c.cargo || c.bio || ""))
    .replace(/\{\{FOTO\}\}/g, caminhoAsset(c.slug, c.foto))
    .replace(/\{\{FOTO_CLASSE\}\}/g, fotoClasse)
    .replace(/\{\{ANTES_NOME\}\}/g, antesNome)
    .replace(/\{\{NOME\}\}/g, esc(tituloPrincipal))
    .replace(/\{\{DEPOIS_NOME\}\}/g, depoisNome)
    .replace(/\{\{ALT_FOTO\}\}/g, esc(altFoto))
    .replace(/\{\{CARGO\}\}/g, cargo)
    .replace(/\{\{BIO\}\}/g, bio)
    .replace(/\{\{ZAP\}\}/g, botaoZap(c))
    .replace(/\{\{PALETA_CSS\}\}/g, cssPaleta(paleta))
    .replace(/\{\{BLOCOS\}\}/g, blocos);
}

function carregarEnvBuild() {
  const caminho = path.join(RAIZ, ".env");
  if (!fs.existsSync(caminho)) return;
  for (const linha of fs.readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const chave = t.slice(0, i).trim();
    let valor = t.slice(i + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (process.env[chave] == null) process.env[chave] = valor;
  }
}

function gerarHome(template) {
  carregarEnvBuild();
  const linkOuHash = (v) => (temTexto(v) ? v : "/#precos");
  return template
    .replace(/\{\{LINK_MENSAL\}\}/g, esc(linkOuHash(process.env.ASAAS_LINK_MENSAL)))
    .replace(/\{\{LINK_ANUAL_PARCELADO\}\}/g, esc(linkOuHash(process.env.ASAAS_LINK_ANUAL_PARCELADO)))
    .replace(/\{\{LINK_ANUAL_AVISTA\}\}/g, esc(linkOuHash(process.env.ASAAS_LINK_ANUAL_AVISTA)));
}

function gerarRepresentantes(clientes, template) {
  return template
    .replace(/\{\{FICHAS\}\}/g, gerarFichas(clientes))
    .replace(/\{\{TOTAL\}\}/g, String(clientes.length));
}

function gerar404() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Página não encontrada — My Rep</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
<link rel="icon" href="/img/favicon.png" type="image/png">
</head>
<body class="pagina-erro">
  <main class="shell shell--estreito erro">
    <p class="marca marca--compacta">
      <img src="/img/logo.png" alt="My Rep" width="36" height="36">
    </p>
    <p class="eyebrow">Erro 404</p>
    <h1 class="erro__titulo">Página não encontrada</h1>
    <p class="erro__sub">Esse endereço não existe ou o representante não está cadastrado.</p>
    <a class="btn btn--primario" href="/">Voltar ao My Rep</a>
  </main>
</body>
</html>
`;
}

/* ---------------- execução ---------------- */

async function build() {
  const inicio = Date.now();
  console.log("\n▸ Gerando site…\n");

  const { clientes, origem } = await lerClientesAsync();
  _assetsModo = origem === "supabase" ? "storage" : "local";

  if (!clientes.length) {
    console.error("  Nenhum cliente válido. Nada foi gerado.\n");
    return;
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  copiarPasta(DIR_PUBLICO, DIST);
  if (_assetsModo === "local") {
    copiarPasta(DIR_ASSETS, path.join(DIST, "assets-clientes"));
  }

  const tplPagina = fs.readFileSync(path.join(DIR_TEMPLATE, "pagina.html"), "utf8");
  const tplHome = fs.readFileSync(path.join(DIR_TEMPLATE, "home.html"), "utf8");
  const tplRepresentantes = fs.readFileSync(path.join(DIR_TEMPLATE, "representantes.html"), "utf8");

  for (const c of clientes) {
    const pasta = path.join(DIST, c.slug);
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, "index.html"), gerarPagina(c, tplPagina));
    console.log(`  ✓ /${c.slug}/`);
  }

  fs.writeFileSync(path.join(DIST, "index.html"), gerarHome(tplHome));
  console.log(`  ✓ / (home)`);

  const pastaReps = path.join(DIST, "representantes");
  fs.mkdirSync(pastaReps, { recursive: true });
  fs.writeFileSync(path.join(pastaReps, "index.html"), gerarRepresentantes(clientes, tplRepresentantes));
  console.log(`  ✓ /representantes/`);

  const tplBriefing = fs.readFileSync(path.join(DIR_TEMPLATE, "briefing.html"), "utf8");
  const pastaBriefing = path.join(DIST, "briefing");
  fs.mkdirSync(pastaBriefing, { recursive: true });
  fs.writeFileSync(path.join(pastaBriefing, "index.html"), tplBriefing);
  console.log(`  ✓ /briefing/`);

  const tplPagamento = fs.readFileSync(path.join(DIR_TEMPLATE, "pagamento-ok.html"), "utf8");
  const pastaPagamento = path.join(DIST, "pagamento", "ok");
  fs.mkdirSync(pastaPagamento, { recursive: true });
  fs.writeFileSync(path.join(pastaPagamento, "index.html"), tplPagamento);
  console.log(`  ✓ /pagamento/ok/`);

  const tplAssinantes = fs.readFileSync(path.join(DIR_TEMPLATE, "assinantes.html"), "utf8");
  const pastaAssinantes = path.join(DIST, "assinantes");
  fs.mkdirSync(pastaAssinantes, { recursive: true });
  fs.writeFileSync(path.join(pastaAssinantes, "index.html"), tplAssinantes);
  console.log(`  ✓ /assinantes/`);

  fs.writeFileSync(path.join(DIST, "404.html"), gerar404());
  console.log(`  ✓ /404.html`);

  console.log(`\n▸ ${clientes.length} representantes · ${Date.now() - inicio}ms → /dist\n`);
}

if (require.main === module) {
  build().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}

module.exports = { build };
