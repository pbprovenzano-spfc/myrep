/* =========================================================
   Helpers de planos, token HMAC e cliente Asaas
   ========================================================= */

const crypto = require("crypto");

const PLANOS = {
  mensal: {
    id: "mensal",
    nome: "Mensal",
    valor: 17.9,
    tipo: "recorrente",
    descricao: "R$ 17,90 por mês",
    labelPreco: "R$ 17,90",
    labelCiclo: "/mês"
  },
  anual: {
    id: "anual",
    nome: "Anual",
    valor: 130.8,
    tipo: "avulso",
    descricao: "R$ 130,80 no ano (12× de R$ 10,90)",
    labelPreco: "R$ 130,80",
    labelCiclo: "no ano",
    parcelas: 12,
    valorParcela: 10.9,
    total: 130.8
  },
  vitalicio: {
    id: "vitalicio",
    nome: "Vitalício",
    valor: 0,
    tipo: "vitalicio",
    checkout: false,
    descricao: "Acesso permanente (código)",
    labelPreco: "Vitalício",
    labelCiclo: ""
  }
};

const STATUS_PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

function asaasBaseUrl() {
  return (process.env.ASAAS_API_URL || "https://api.asaas.com/v3").replace(/\/$/, "");
}

function asaasHeaders() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) {
    const erro = new Error("ASAAS_API_KEY não configurada.");
    erro.status = 500;
    throw erro;
  }
  return {
    "Content-Type": "application/json",
    access_token: key
  };
}

async function asaasFetch(caminho, opcoes = {}) {
  const url = `${asaasBaseUrl()}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
  const resp = await fetch(url, {
    ...opcoes,
    headers: {
      ...asaasHeaders(),
      ...(opcoes.headers || {})
    }
  });
  let body = null;
  const texto = await resp.text();
  try {
    body = texto ? JSON.parse(texto) : null;
  } catch {
    body = { raw: texto };
  }
  if (!resp.ok) {
    const msg =
      (body && (body.errors?.[0]?.description || body.message)) ||
      `Asaas HTTP ${resp.status}`;
    const erro = new Error(msg);
    erro.status = resp.status >= 500 ? 502 : 400;
    erro.asaas = body;
    throw erro;
  }
  return body;
}

function tokenSecret() {
  const secret = process.env.PAGAMENTO_TOKEN_SECRET || process.env.ASAAS_API_KEY;
  if (!secret) {
    const erro = new Error("PAGAMENTO_TOKEN_SECRET não configurado.");
    erro.status = 500;
    throw erro;
  }
  return secret;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function deB64url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
}

function assinar(payloadB64) {
  return crypto.createHmac("sha256", tokenSecret()).update(payloadB64).digest("base64url");
}

function lerToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    const erro = new Error("Token inválido.");
    erro.status = 401;
    throw erro;
  }
  const [payload, sig] = token.split(".");
  if (assinar(payload) !== sig) {
    const erro = new Error("Token inválido ou adulterado.");
    erro.status = 401;
    throw erro;
  }
  let dados;
  try {
    dados = JSON.parse(deB64url(payload));
  } catch {
    const erro = new Error("Token corrompido.");
    erro.status = 401;
    throw erro;
  }
  if (!dados.exp || dados.exp < Math.floor(Date.now() / 1000)) {
    const erro = new Error("Token expirado. Libere o acesso novamente.");
    erro.status = 401;
    throw erro;
  }
  if (dados.role === "admin") return dados;
  if (!PLANOS[dados.plano]) {
    const erro = new Error("Plano do token desconhecido.");
    erro.status = 401;
    throw erro;
  }
  return dados;
}

function valoresIguais(a, b, tol = 0.05) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

async function buscarClientePorEmail(email) {
  const q = encodeURIComponent(String(email).trim().toLowerCase());
  const data = await asaasFetch(`/customers?email=${q}&limit=10`);
  const lista = data?.data || [];
  return lista[0] || null;
}

async function listarPagamentosCliente(customerId, { limit = 20 } = {}) {
  const data = await asaasFetch(`/payments?customer=${encodeURIComponent(customerId)}&limit=${limit}`);
  return data?.data || [];
}

function lerJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("JSON inválido."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function linksPlanos() {
  return {
    mensal: process.env.ASAAS_LINK_MENSAL || "",
    anual: process.env.ASAAS_LINK_ANUAL || ""
  };
}

function adminSenhaOk(senha) {
  const esperada = process.env.ADMIN_PASSWORD;
  if (!esperada || !senha) return false;
  const a = Buffer.from(String(senha));
  const b = Buffer.from(String(esperada));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function emitirSessaoAdmin(dias = 14) {
  const exp = Math.floor(Date.now() / 1000) + dias * 24 * 60 * 60;
  const payload = b64url(JSON.stringify({ role: "admin", exp }));
  return `${payload}.${assinar(payload)}`;
}

function lerSessaoAdmin(token) {
  const dados = lerToken(token);
  if (dados.role !== "admin") {
    const erro = new Error("Sessão inválida.");
    erro.status = 401;
    throw erro;
  }
  return dados;
}

function cookieValor(req, nome) {
  const raw = req.headers.cookie || "";
  const partes = raw.split(";").map((p) => p.trim());
  for (const p of partes) {
    const i = p.indexOf("=");
    if (i < 1) continue;
    if (p.slice(0, i) === nome) return decodeURIComponent(p.slice(i + 1));
  }
  return "";
}

module.exports = {
  PLANOS,
  STATUS_PAGO,
  asaasFetch,
  lerToken,
  buscarClientePorEmail,
  listarPagamentosCliente,
  lerJsonBody,
  json,
  linksPlanos,
  adminSenhaOk,
  emitirSessaoAdmin,
  lerSessaoAdmin,
  cookieValor,
  valoresIguais
};
