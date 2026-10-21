/* =========================================================
   build.js — gerador estático do My Rep
   Páginas de representantes são renderizadas em runtime via /api/pagina.
   As páginas de exemplo (exemplos/*.json, dados fictícios) saem estáticas.
   ========================================================= */

const fs = require("fs");
const path = require("path");
const {
  gerar404,
  gerarPagina,
  gerarPaginaMarca,
  lerTemplatePagina,
  setAssetsModo
} = require("./api/_lib/render/pagina");
const { normalizarDados } = require("./api/_lib/dados");

const RAIZ = __dirname;
const DIR_TEMPLATE = path.join(RAIZ, "template");
const DIR_PUBLICO = path.join(RAIZ, "publico");
const DIR_GEO = path.join(RAIZ, "geo");
const DIR_EXEMPLOS = path.join(RAIZ, "exemplos");
const DIST = path.join(RAIZ, "dist");

const temTexto = (s) => typeof s === "string" && s.trim() !== "";

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

function limiteUploadBytes() {
  const n = Number(process.env.UPLOAD_MAX_BYTES);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 50 * 1024 * 1024;
}

function cfgSupabaseBrowser() {
  carregarEnvBuild();
  return JSON.stringify({
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "assets-clientes",
    uploadMaxBytes: limiteUploadBytes()
  });
}

function injetarSupabase(html) {
  carregarEnvBuild();
  const mb = Math.round(limiteUploadBytes() / (1024 * 1024));
  return String(html)
    .replace(/\{\{MYREP_SUPABASE\}\}/g, cfgSupabaseBrowser())
    .replace(/\{\{UPLOAD_MAX_MB\}\}/g, String(mb));
}

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function gerarHome(template) {
  return injetarSupabase(template);
}

function paginaRedirect(destino, titulo = "Redirecionando...") {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${destino}">
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${destino}">
<title>${titulo}</title>
<script>location.replace(${JSON.stringify(destino)}+(location.search||"")+(location.hash||""));</script>
</head>
<body>
  <p><a href="${destino}">Continuar</a></p>
</body>
</html>
`;
}

const SITE = "https://www.myrep.com.br";

// Faixa + aviso nos contatos: os números e e-mails dos exemplos são fictícios.
const EXEMPLO_FAIXA = `<div class="exemplo-faixa" role="note">
  <span>Página de exemplo · dados fictícios</span>
  <a href="/cadastro/">Criar a minha</a>
</div>`;

const EXEMPLO_SCRIPT = `<p class="exemplo-toast" id="exemplo-toast" role="status" hidden></p>
<script>
(function () {
  var toast = document.getElementById("exemplo-toast");
  var timer;
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    var ficticio = ["https://wa.me/", "tel:", "mailto:", "https://www.instagram.com"].some(function (p) {
      return href.indexOf(p) === 0;
    });
    if (!ficticio) return;
    ev.preventDefault();
    toast.textContent = "Contato fictício: esta é uma página de exemplo. Na sua, o cliente cai direto no seu WhatsApp.";
    toast.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { toast.hidden = true; }, 4000);
  });
})();
</script>`;

function marcarExemplo(html) {
  return html
    .replace("<head>", '<head>\n<meta name="robots" content="noindex">')
    .replace(/<body([^>]*)>/, `<body$1>\n${EXEMPLO_FAIXA}`)
    .replace("</body>", `${EXEMPLO_SCRIPT}\n</body>`);
}

function gerarExemplos() {
  if (!fs.existsSync(DIR_EXEMPLOS)) return;
  setAssetsModo("local");
  const tpl = lerTemplatePagina();
  const arquivos = fs.readdirSync(DIR_EXEMPLOS).filter((f) => f.endsWith(".json"));
  for (const arquivo of arquivos) {
    const bruto = JSON.parse(fs.readFileSync(path.join(DIR_EXEMPLOS, arquivo), "utf8"));
    const dados = normalizarDados(bruto);
    const pasta = path.join(DIST, dados.slug);
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, "index.html"), marcarExemplo(gerarPagina(dados, tpl)));
    for (const marca of dados.marcas) {
      const pastaMarca = path.join(pasta, marca.slug);
      fs.mkdirSync(pastaMarca, { recursive: true });
      fs.writeFileSync(path.join(pastaMarca, "index.html"), marcarExemplo(gerarPaginaMarca(dados, marca, tpl)));
    }
    copiarPasta(path.join(DIR_EXEMPLOS, "assets", dados.slug), path.join(DIST, "assets-clientes", dados.slug));
    console.log(`  ✓ /${dados.slug}/ (exemplo, ${dados.marcas.length} marcas)`);
  }
}

function robotsTxt() {
  return [
    "User-agent: *",
    "Disallow: /painel/",
    "Disallow: /admin/",
    "Disallow: /assinantes/",
    "Disallow: /api/",
    "Disallow: /pagamento/",
    "",
    `Sitemap: ${SITE}/sitemap.xml`,
    ""
  ].join("\n");
}

// Só as páginas fixas; as dos representantes entram quando houver sitemap dinâmico.
function sitemapXml() {
  const urls = ["/", "/termos/"]
    .map((p) => `  <url><loc>${SITE}${p}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function build() {
  const inicio = Date.now();
  console.log("\n▸ Gerando site…\n");

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  copiarPasta(DIR_PUBLICO, DIST);
  copiarPasta(DIR_GEO, path.join(DIST, "geo"));

  const tplHome = fs.readFileSync(path.join(DIR_TEMPLATE, "home.html"), "utf8");
  fs.writeFileSync(path.join(DIST, "index.html"), gerarHome(tplHome));
  console.log("  ✓ / (home)");

  const paginasAuth = [
    ["cadastro", "cadastro.html"],
    ["entrar", "entrar.html"],
    ["recuperar-senha", "recuperar-senha.html"],
    ["painel", "painel.html"]
  ];
  for (const [pasta, arquivo] of paginasAuth) {
    const tpl = fs.readFileSync(path.join(DIR_TEMPLATE, arquivo), "utf8");
    const dest = path.join(DIST, pasta);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "index.html"), injetarSupabase(tpl));
    console.log(`  ✓ /${pasta}/`);
  }

  const tplPainel = fs.readFileSync(path.join(DIR_TEMPLATE, "painel.html"), "utf8");
  const pastaPainelMarca = path.join(DIST, "painel", "marca");
  fs.mkdirSync(pastaPainelMarca, { recursive: true });
  fs.writeFileSync(path.join(pastaPainelMarca, "index.html"), injetarSupabase(tplPainel));
  console.log("  ✓ /painel/marca/");

  const tplAssinatura = fs.readFileSync(path.join(DIR_TEMPLATE, "assinatura.html"), "utf8");
  const pastaAssinatura = path.join(DIST, "painel", "assinatura");
  fs.mkdirSync(pastaAssinatura, { recursive: true });
  fs.writeFileSync(path.join(pastaAssinatura, "index.html"), injetarSupabase(tplAssinatura));
  console.log("  ✓ /painel/assinatura/");

  const tplConfirme = fs.readFileSync(path.join(DIR_TEMPLATE, "cadastro-confirme.html"), "utf8");
  const pastaConfirme = path.join(DIST, "cadastro", "confirme");
  fs.mkdirSync(pastaConfirme, { recursive: true });
  fs.writeFileSync(path.join(pastaConfirme, "index.html"), tplConfirme);
  console.log("  ✓ /cadastro/confirme/");

  const tplTermos = fs.readFileSync(path.join(DIR_TEMPLATE, "termos.html"), "utf8");
  const pastaTermos = path.join(DIST, "termos");
  fs.mkdirSync(pastaTermos, { recursive: true });
  fs.writeFileSync(path.join(pastaTermos, "index.html"), tplTermos);
  console.log("  ✓ /termos/");

  const tplPagamento = fs.readFileSync(path.join(DIR_TEMPLATE, "pagamento-ok.html"), "utf8");
  const pastaPagamento = path.join(DIST, "pagamento", "ok");
  fs.mkdirSync(pastaPagamento, { recursive: true });
  fs.writeFileSync(path.join(pastaPagamento, "index.html"), tplPagamento);
  console.log("  ✓ /pagamento/ok/");

  const tplAdmin = fs.readFileSync(path.join(DIR_TEMPLATE, "admin.html"), "utf8");
  const pastaAdmin = path.join(DIST, "admin");
  fs.mkdirSync(pastaAdmin, { recursive: true });
  fs.writeFileSync(path.join(pastaAdmin, "index.html"), tplAdmin);
  console.log("  ✓ /admin/");

  const pastaAssinantes = path.join(DIST, "assinantes");
  fs.mkdirSync(pastaAssinantes, { recursive: true });
  fs.writeFileSync(
    path.join(pastaAssinantes, "index.html"),
    paginaRedirect("/admin/", "Redirecionando…")
  );
  console.log("  ✓ /assinantes/ → /admin/");

  for (const legado of ["briefing", "alteracoes", "representantes"]) {
    const pasta = path.join(DIST, legado);
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(
      path.join(pasta, "index.html"),
      paginaRedirect("/painel/", "Redirecionando para o painel…")
    );
    console.log(`  ✓ /${legado}/ → /painel/`);
  }

  gerarExemplos();

  fs.writeFileSync(path.join(DIST, "robots.txt"), robotsTxt());
  fs.writeFileSync(path.join(DIST, "sitemap.xml"), sitemapXml());
  console.log("  ✓ /robots.txt + /sitemap.xml");

  fs.writeFileSync(path.join(DIST, "404.html"), gerar404());
  console.log("  ✓ /404.html");
  console.log("  ✓ Páginas de representantes → /api/pagina (runtime)");

  console.log(`\n▸ Build concluído em ${Date.now() - inicio}ms → /dist\n`);
}

if (require.main === module) {
  build().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}

module.exports = { build };
