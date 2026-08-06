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
const OBSERVAR = ["clientes", "template", "publico", "assets-clientes", "api"];

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
  "assets-clientes",
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

rodarBuild();

function parseMultipartDev(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  const boundary = m && (m[1] || m[2]);
  if (!boundary) throw new Error("Content-Type inválido");

  const sep = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(sep) + sep.length;

  while (start < buffer.length) {
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const next = buffer.indexOf(sep, start);
    if (next < 0) break;
    let part = buffer.slice(start, next);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.slice(0, -2);
    }
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const headers = part.slice(0, headerEnd).toString("utf8");
      const body = part.slice(headerEnd + 4);
      const nameMatch = /name="([^"]+)"/i.exec(headers);
      const fileMatch = /filename="([^"]*)"/i.exec(headers);
      if (nameMatch) {
        parts.push({
          name: nameMatch[1],
          filename: fileMatch ? fileMatch[1] : null,
          data: body
        });
      }
    }
    start = next + sep.length;
  }
  return parts;
}

function briefingLocal(req, res) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    try {
      const buffer = Buffer.concat(chunks);
      const parts = parseMultipartDev(buffer, req.headers["content-type"]);
      const slugPart = parts.find((p) => p.name === "slug" && !p.filename);
      const nomePart = parts.find((p) => p.name === "nome" && !p.filename);
      const emailPart = parts.find((p) => p.name === "emailCliente" && !p.filename);
      const acessoPart = parts.find((p) => p.name === "acesso" && !p.filename);
      const zipPart = parts.find((p) => p.name === "zip");
      const slug = slugPart ? slugPart.data.toString("utf8").trim() : "briefing";
      const nome = nomePart ? nomePart.data.toString("utf8").trim() : slug;
      const emailCliente = emailPart ? emailPart.data.toString("utf8").trim() : "";
      const acesso = acessoPart ? acessoPart.data.toString("utf8").trim() : "";
      if (!zipPart) throw new Error("ZIP ausente");

      let acessoDados = null;
      if (process.env.PAGAMENTO_TOKEN_SECRET || process.env.ASAAS_API_KEY) {
        const { lerToken } = require("./api/_lib/pagamento");
        acessoDados = lerToken(acesso);
      }

      const { lerZip } = require("./api/_lib/zip");
      const {
        criarMensagem,
        salvarAnexos,
        mimePorNome,
        nomeArquivoSeguro
      } = require("./api/_lib/inbox");

      let dadosJson = null;
      const anexosInbox = [];
      try {
        for (const entrada of lerZip(zipPart.data)) {
          const n = entrada.nome.replace(/^\/+/, "");
          if (n.endsWith(".json") && !dadosJson) {
            try {
              dadosJson = JSON.parse(entrada.data.toString("utf8"));
            } catch {
              /* ignore */
            }
            continue;
          }
          const prefixo = `assets-clientes/${slug}/`;
          let nomeArq = null;
          if (n.startsWith(prefixo)) nomeArq = n.slice(prefixo.length);
          else if (n.startsWith("assets-clientes/") && n.includes("/")) nomeArq = n.split("/").pop();
          if (nomeArq && !nomeArq.includes("/")) {
            anexosInbox.push({
              nome: nomeArquivoSeguro(nomeArq),
              data: entrada.data,
              mime: mimePorNome(nomeArq),
              origem: "zip"
            });
          }
        }
      } catch (erroZip) {
        console.error("briefing local zip:", erroZip.message || erroZip);
      }
      anexosInbox.push({
        nome: `${slug}-myrep.zip`,
        data: zipPart.data,
        mime: "application/zip",
        origem: "upload"
      });

      const assunto = `My Rep briefing — ${nome} (${slug})`;
      const texto = [
        `Novo briefing My Rep (dev).`,
        ``,
        `Nome: ${nome}`,
        `Slug: ${slug}`,
        emailCliente ? `E-mail do cliente: ${emailCliente}` : null,
        acessoDados ? `E-mail do pagamento: ${acessoDados.email}` : null
      ]
        .filter(Boolean)
        .join("\n");

      const mensagem = await criarMensagem({
        tipo: "briefing",
        assunto,
        remetenteNome: nome,
        remetenteEmail: emailCliente || acessoDados?.email || null,
        slug,
        dados: {
          ...(dadosJson && typeof dadosJson === "object" ? dadosJson : {}),
          slug,
          nome,
          emailCliente: emailCliente || null
        },
        corpo: texto
      });
      if (mensagem?.id) await salvarAnexos(mensagem.id, anexosInbox);
      console.log(`  ✓ briefing inbox: ${mensagem?.id || "?"}`);

      const emailAssoc = emailCliente || acessoDados?.email || null;
      if (mensagem?.id && slug && emailAssoc) {
        try {
          const { associarEmailSeVazio } = require("./api/_lib/paginas");
          await associarEmailSeVazio(slug, emailAssoc);
        } catch (erroAssoc) {
          console.error("briefing associar e-mail:", erroAssoc.message || erroAssoc);
        }
      }

      if (!mensagem?.id) {
        throw Object.assign(new Error("Falha ao gravar briefing na inbox."), { status: 500 });
      }

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          modo: "local",
          mensagemId: mensagem.id
        })
      );
    } catch (erro) {
      console.error(erro);
      res.writeHead(erro.status || 400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ erro: erro.message || "Falha no briefing local" }));
    }
  });
}

const API_HANDLERS = {
  "/api/pagamento/liberar": () => require("./api/pagamento/liberar"),
  "/api/pagamento/validar": () => require("./api/pagamento/validar"),
  "/api/asaas/webhook": () => require("./api/asaas/webhook"),
  "/api/assinantes": () => require("./api/assinantes"),
  "/api/admin": () => require("./api/admin"),
  "/api/alteracoes": () => require("./api/alteracoes"),
  "/api/paginas/status": () => require("./api/paginas/status"),
  "/api/auth/perfil": () => require("./api/auth/perfil"),
  "/api/auth/logout": () => require("./api/auth/logout"),
  "/api/painel/checkout": () => require("./api/painel/checkout"),
  "/api/painel/briefing": () => require("./api/painel/briefing"),
  "/api/painel/alteracoes": () => require("./api/painel/alteracoes"),
  "/api/painel/pagina": () => require("./api/painel/pagina")
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
  if (req.method === "POST" && (url === "/api/briefing" || url === "/api/painel/briefing")) {
    if (url === "/api/painel/briefing") {
      invocarApi(require("./api/painel/briefing"), req, res);
      return;
    }
    briefingLocal(req, res);
    return;
  }

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
  console.log(`  Briefing:   http://localhost:${PORTA}/briefing/ (legacy)`);
  console.log(`  Pagamento:  http://localhost:${PORTA}/pagamento/ok/`);
  console.log(`  Admin:      http://localhost:${PORTA}/admin/`);
  console.log(`  Assinantes: http://localhost:${PORTA}/assinantes/ → /admin/`);
  console.log(`  Ctrl+C para parar.\n`);
  observar();
});
