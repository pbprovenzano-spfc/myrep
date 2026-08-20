/* =========================================================
   dev.js — servidor local + rebuild automático
   Uso: npm run dev   →   http://localhost:3000
   Sem dependências: só Node.
   ========================================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PORTA = process.env.PORT || 3000;
const RAIZ = __dirname;
const DIST = path.join(RAIZ, "dist");
const OBSERVAR = ["template", "publico", "geo", "api"];

function carregarEnvLocal() {
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

carregarEnvLocal();

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon"
};

/* ---------------- build ---------------- */

function rodarBuild() {
  try {
    const saida = execFileSync(process.execPath, [path.join(RAIZ, "build.js")], { encoding: "utf8" });
    process.stdout.write(saida);
  } catch (erro) {
    console.error("Erro no build:\n", erro.stdout || erro.message);
  }
}

/* ---------------- servidor ---------------- */

const ROTAS_RESERVADAS = new Set([
  "",
  "api",
  "css",
  "js",
  "img",
  "admin",
  "briefing",
  "pagamento",
  "alteracoes",
  "termos",
  "representantes",
  "assinantes",
  "cadastro",
  "entrar",
  "recuperar-senha",
  "painel",
  "geo",
  "inbox"
]);

function slugDaUrl(urlPath) {
  const partes = String(urlPath || "/")
    .split("?")[0]
    .split("/")
    .filter(Boolean);
  if (!partes.length) return "";
  if (ROTAS_RESERVADAS.has(partes[0])) return "";
  if (partes[0].includes(".")) return "";
  return partes[0];
}

function servir404(res) {
  const pagina404 = path.join(DIST, "404.html");
  if (fs.existsSync(pagina404)) {
    res.writeHead(404, { "Content-Type": TIPOS[".html"] });
    res.end(injetarRecarga(fs.readFileSync(pagina404, "utf8")));
  } else {
    res.writeHead(404).end("Não encontrado");
  }
}

async function paginaClienteAtiva(slug) {
  if (!slug) return true;
  try {
    const { paginaAtiva } = require("./api/_lib/paginas");
    return await paginaAtiva(slug);
  } catch (erro) {
    console.error("gate pagina:", erro.message || erro);
    return true;
  }
}

async function servir(req, res) {
  let url = decodeURIComponent(req.url.split("?")[0]);
  let caminho = path.join(DIST, url);

  // Evita sair da pasta dist
  if (!caminho.startsWith(DIST)) {
    res.writeHead(403).end("Acesso negado");
    return;
  }

  const slugCliente = slugDaUrl(url);
  if (slugCliente) {
    const ativa = await paginaClienteAtiva(slugCliente);
    if (!ativa) {
      servir404(res);
      return;
    }
  }

  // /slug  →  /slug/index.html
  if (fs.existsSync(caminho) && fs.statSync(caminho).isDirectory()) {
    caminho = path.join(caminho, "index.html");
  } else if (!fs.existsSync(caminho) && fs.existsSync(caminho + path.sep + "index.html")) {
    caminho = path.join(caminho, "index.html");
  }

  if (!fs.existsSync(caminho) || fs.statSync(caminho).isDirectory()) {
    if (slugCliente) {
      const fakeReq = {
        method: req.method,
        url: `/api/pagina?slug=${encodeURIComponent(slugCliente)}`,
        headers: req.headers
      };
      return invocarApi(require("./api/pagina"), fakeReq, res);
    }
    servir404(res);
    return;
  }

  const ext = path.extname(caminho).toLowerCase();
  const tipo = TIPOS[ext] || "application/octet-stream";

  res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "no-store" });

  if (ext === ".html") {
    res.end(injetarRecarga(fs.readFileSync(caminho, "utf8")));
  } else {
    res.end(fs.readFileSync(caminho));
  }
}

/* ---------------- recarga automática ---------------- */

let versao = Date.now();
const clientesSSE = new Set();

const SCRIPT_RECARGA = `
<script>
(function(){
  var fonte = new EventSource("/__recarga");
  fonte.onmessage = function(){ location.reload(); };
})();
</script>`;

function injetarRecarga(html) {
  return html.replace("</body>", SCRIPT_RECARGA + "\n</body>");
}

function avisarClientes() {
  versao = Date.now();
  for (const res of clientesSSE) res.write("data: " + versao + "\n\n");
}

/* ---------------- watch ---------------- */

function observar() {
  let agendado = null;

  for (const pasta of OBSERVAR) {
    const alvo = path.join(RAIZ, pasta);
    if (!fs.existsSync(alvo)) continue;

    fs.watch(alvo, { recursive: true }, () => {
      clearTimeout(agendado);
      agendado = setTimeout(() => {
        console.log("\n▸ Mudança detectada, reconstruindo…");
        rodarBuild();
        avisarClientes();
      }, 120);
    });
  }
}

/* ---------------- start ---------------- */

const API_HANDLERS = {
  "/api/pagamento": () => require("./api/pagamento"),
  "/api/pagamento/liberar": () => require("./api/_lib/handlers/pagamento-liberar"),
  "/api/pagamento/validar": () => require("./api/_lib/handlers/pagamento-validar"),
  "/api/asaas/webhook": () => require("./api/asaas/webhook"),
  "/api/assinantes": () => require("./api/admin"),
  "/api/admin": () => require("./api/admin"),
  "/api/paginas/status": () => require("./api/paginas/status"),
  "/api/pagina": () => require("./api/pagina"),
  "/api/auth": () => require("./api/auth"),
  "/api/auth/perfil": () => require("./api/_lib/handlers/auth-perfil"),
  "/api/auth/logout": () => require("./api/_lib/handlers/auth-logout"),
  "/api/painel": () => require("./api/painel"),
  "/api/painel/checkout": () => require("./api/_lib/handlers/painel-checkout"),
  "/api/painel/pagina": () => require("./api/_lib/handlers/painel-pagina"),
  "/api/painel/slug": () => require("./api/_lib/handlers/painel-slug"),
  "/api/painel/suporte": () => require("./api/_lib/handlers/painel-suporte")
};

function invocarApi(handler, req, res) {
  Promise.resolve(handler(req, res)).catch((erro) => {
    console.error(erro);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ erro: erro.message || "Erro interno" }));
    }
  });
}

rodarBuild();

http.createServer((req, res) => {
  if (req.url === "/__recarga") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write("\n");
    clientesSSE.add(res);
    req.on("close", () => clientesSSE.delete(res));
    return;
  }

  const url = req.url.split("?")[0].replace(/\/$/, "") || "/";

  const carregar = API_HANDLERS[url];
  if (carregar) {
    invocarApi(carregar(), req, res);
    return;
  }

  Promise.resolve(servir(req, res)).catch((erro) => {
    console.error(erro);
    if (!res.headersSent) {
      res.writeHead(500).end("Erro interno");
    }
  });
}).listen(PORTA, () => {
  console.log(`▸ Servidor em http://localhost:${PORTA}`);
  console.log(`  Home:       http://localhost:${PORTA}/`);
  console.log(`  Cadastro:   http://localhost:${PORTA}/cadastro/`);
  console.log(`  Entrar:     http://localhost:${PORTA}/entrar/`);
  console.log(`  Painel:     http://localhost:${PORTA}/painel/`);
  console.log(`  Pagamento:  http://localhost:${PORTA}/pagamento/ok/`);
  console.log(`  Admin:      http://localhost:${PORTA}/admin/`);
  console.log(`  Assinantes: http://localhost:${PORTA}/assinantes/ → /admin/`);
  console.log(`  Ctrl+C para parar.\n`);
  observar();
});
