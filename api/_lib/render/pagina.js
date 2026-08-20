/* =========================================================
   Renderização HTML das páginas de representantes
   Compartilhado entre build.js (legado) e api/pagina.js (runtime)
   ========================================================= */

const path = require("path");
const fs = require("fs");

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

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const temItens = (a) => Array.isArray(a) && a.length > 0;
const temTexto = (s) => typeof s === "string" && s.trim() !== "";

let _assetsModo = "storage";
let _dirGeo = path.join(__dirname, "..", "..", "..", "geo");

function setAssetsModo(modo) {
  _assetsModo = modo === "local" ? "local" : "storage";
}

function setDirGeo(dir) {
  if (dir) _dirGeo = dir;
}

function caminhoAsset(slug, arquivo) {
  if (!arquivo) return "";
  if (_assetsModo === "storage") {
    const { storagePublicUrl } = require("../supabase");
    return storagePublicUrl(slug, arquivo);
  }
  return `/assets-clientes/${slug}/${arquivo}`;
}

function resolverPaleta(c) {
  const bruto = temTexto(c.paleta) ? c.paleta.trim().toLowerCase() : PALETA_PADRAO;
  if (!PALETAS[bruto]) {
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

function normalizarCidades(cidades, estados) {
  const porUf = {};
  for (const uf of estados) porUf[uf] = [];

  if (Array.isArray(cidades)) {
    if (estados.length === 1) {
      porUf[estados[0]] = cidades.filter(temTexto);
    }
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

function logoCatalogo(c, cat) {
  if (cat.marcaId && temItens(c.marcas)) {
    const marca = c.marcas.find((m) => m.id === cat.marcaId);
    if (marca?.logo) {
      return `<img class="link-btn__logo" src="${caminhoAsset(c.slug, marca.logo)}" alt="" loading="lazy">`;
    }
  }
  if (cat.logo) {
    return `<img class="link-btn__logo" src="${caminhoAsset(c.slug, cat.logo)}" alt="" loading="lazy">`;
  }
  return `<span class="link-btn__meta">${esc(cat.tipo || "PDF")}</span>`;
}

function blocoMarcas(c) {
  if (!temItens(c.marcas)) return "";
  const itens = c.marcas
    .map((m) =>
      m.logo
        ? `        <li class="marca-chip"><img src="${caminhoAsset(c.slug, m.logo)}" alt="${esc(m.nome)}" loading="lazy"></li>`
        : `        <li class="marca-chip"><span class="marca-chip__nome">${esc(m.nome)}</span></li>`
    )
    .join("\n");

  return `  <section class="bloco bloco--marcas">
    <h2 class="rotulo">Marcas</h2>
    <ul class="marcas">
${itens}
    </ul>
  </section>`;
}

function blocoAtuacao(c) {
  if (!temItens(c.estados) && !temTexto(c.segmentos)) return "";

  const estados = temItens(c.estados) ? c.estados.map((uf) => String(uf).toUpperCase()) : [];
  const porUf = normalizarCidades(c.cidades, estados);
  const glow = resolverPaleta(c).vars["--sinal"];
  const drill = estados.length > 1 ? ' data-mapa="drill"' : "";

  const dataEstados = esc(JSON.stringify(estados));
  const dataCidades = esc(JSON.stringify(porUf));
  const dataGlow = esc(glow);

  const seg = temTexto(c.segmentos) ? `    <p class="segmentos">${esc(c.segmentos)}</p>` : "";

  return `  <section class="bloco bloco--atuacao"${drill} data-mapa-mount data-estados="${dataEstados}" data-cidades="${dataCidades}" data-glow="${dataGlow}">
    <h2 class="rotulo">Atuação</h2>
    <div class="mapa-stack">
      <div class="mapa-mount" aria-busy="true"><p class="mapa__carregando">Carregando mapa…</p></div>
${seg}
    </div>
  </section>`;
}

function blocoCatalogos(c) {
  if (!temItens(c.catalogos)) return "";
  const itens = c.catalogos
    .map((cat) => {
      const meta = logoCatalogo(c, cat);
      return `        <li>
          <a class="link-btn" href="${caminhoAsset(c.slug, cat.arquivo)}" target="_blank" rel="noopener">
            <span class="link-btn__texto">${esc(cat.titulo || "Catálogo")}</span>
            ${meta}
          </a>
        </li>`;
    })
    .join("\n");

  return `  <section class="bloco bloco--links">
    <h2 class="rotulo">Catálogos</h2>
    <ul class="links">
${itens}
    </ul>
  </section>`;
}

function blocoContatos(c) {
  if (!temItens(c.contatos)) return "";
  const itens = c.contatos
    .map((ct) => {
      const externo = /^https?:/.test(ct.link || "") ? ' target="_blank" rel="noopener"' : "";
      return `        <li>
          <a class="link-btn" href="${esc(ct.link || "#")}"${externo}>
            <span class="link-btn__texto">${esc(ct.canal)}</span>
            <span class="link-btn__meta">${esc(ct.valor)}</span>
          </a>
        </li>`;
    })
    .join("\n");

  return `  <section class="bloco bloco--links">
    <h2 class="rotulo">Contato</h2>
    <ul class="links">
${itens}
    </ul>
  </section>`;
}

function botaoZap(c) {
  const numero = String(c.whatsapp || "").replace(/\D/g, "");
  if (!numero) return "";
  const msg = temTexto(c.mensagemWhatsapp) ? "?text=" + encodeURIComponent(c.mensagemWhatsapp) : "";
  return `<a class="link-btn link-btn--destaque" href="https://wa.me/${numero}${msg}" target="_blank" rel="noopener">
      <span class="link-btn__icone" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.15-1.18-.06-.11-.23-.17-.48-.29Z"/></svg>
      </span>
      <span class="link-btn__texto">Falar no WhatsApp</span>
    </a>`;
}

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
  const antesNome = destaqueEmpresa ? "" : linhaSecundaria;
  const depoisNome = destaqueEmpresa ? linhaSecundaria : "";
  const cargo = temTexto(c.cargo) ? `<p class="capa__cargo">${esc(c.cargo)}</p>` : "";
  const fotoClasse = c.fotoTipo === "logo" ? "capa__foto capa__foto--logo" : "capa__foto";
  const altFoto = destaqueEmpresa ? `Logo ou foto de ${c.empresa}` : `Foto de ${c.nome}`;

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

function lerTemplatePagina() {
  const candidatos = [
    path.join(__dirname, "..", "..", "..", "template", "pagina.html"),
    path.join(process.cwd(), "template", "pagina.html")
  ];
  for (const p of candidatos) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  throw new Error("template/pagina.html não encontrado");
}

module.exports = {
  PALETAS,
  PALETA_PADRAO,
  esc,
  temItens,
  temTexto,
  setAssetsModo,
  setDirGeo,
  caminhoAsset,
  resolverPaleta,
  cssPaleta,
  blocoMarcas,
  blocoAtuacao,
  blocoCatalogos,
  blocoContatos,
  botaoZap,
  gerarPagina,
  gerar404,
  lerTemplatePagina
};
