/* =========================================================
   build.js — gerador estático do My Rep
   Páginas de representantes são renderizadas em runtime via /api/pagina.
   ========================================================= */

const fs = require("fs");
const path = require("path");
const { gerar404 } = require("./api/_lib/render/pagina");

const RAIZ = __dirname;
const DIR_TEMPLATE = path.join(RAIZ, "template");
const DIR_PUBLICO = path.join(RAIZ, "publico");
const DIR_GEO = path.join(RAIZ, "geo");
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

function cfgSupabaseBrowser() {
  carregarEnvBuild();
  return JSON.stringify({
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "assets-clientes"
  });
}

function injetarSupabase(html) {
  return String(html).replace(/\{\{MYREP_SUPABASE\}\}/g, cfgSupabaseBrowser());
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
