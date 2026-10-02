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
    "User-Agent": "MyRep/1.0",
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
    erro.httpStatus = resp.status;
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

function identificarPlanoPorValor(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  for (const plano of Object.values(PLANOS)) {
    if (plano.checkout === false) continue;
    if (valoresIguais(n, plano.valor)) return plano;
  }
  for (const plano of Object.values(PLANOS)) {
    if (plano.checkout === false || plano.valorParcela == null) continue;
    if (valoresIguais(n, plano.valorParcela)) return plano;
  }
  return null;
}

function referenciaCheckout(userId, planoId) {
  return `myrep:${userId}:${planoId}`;
}

function lerReferenciaCheckout(ref) {
  const m = /^myrep:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(mensal|anual)$/i.exec(
    String(ref || "").trim()
  );
  if (!m) return null;
  return { userId: m[1], planoId: m[2].toLowerCase() };
}

function dataIso(data = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(data);
}

function somarUmAno(iso) {
  const [ano, mes, dia] = String(iso).split("-").map(Number);
  const dt = new Date(Date.UTC(ano + 1, (mes || 1) - 1, dia || 1));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function proximaCobrancaDoPlano(planoId, atual, informada, statusNovo = "ativa") {
  if (planoId === "anual") {
    const limite = String(atual?.proxima_cobranca || "").slice(0, 10);
    const limiteOk = /^\d{4}-\d{2}-\d{2}$/.test(limite);
    if (statusNovo !== "ativa") return limiteOk ? limite : undefined;
    const hoje = dataIso();
    const aindaVale = atual?.plano === "anual" && atual?.status === "ativa" && limiteOk && limite >= hoje;
    if (aindaVale) return limite;
    return somarUmAno(hoje);
  }
  if (!informada) return undefined;
  const iso = String(informada).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
}

function sitePublico(req) {
  const env = String(process.env.SITE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (env) return env;
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "")
    .split(",")[0]
    .trim();
  if (host && !/localhost|127\.0\.0\.1/i.test(host)) {
    const proto = String(req?.headers?.["x-forwarded-proto"] || "https")
      .split(",")[0]
      .trim() || "https";
    return `${proto}://${host}`.replace(/\/$/, "");
  }
  return "https://myrep.com.br";
}

let logoCheckoutCache = null;
function logoCheckoutBase64() {
  if (logoCheckoutCache !== null) return logoCheckoutCache;
  try {
    const fs = require("fs");
    const path = require("path");
    const arquivo = path.join(__dirname, "../../publico/img/favicon.png");
    logoCheckoutCache = fs.readFileSync(arquivo).toString("base64");
  } catch (erro) {
    console.error("logo checkout:", erro.message || erro);
    logoCheckoutCache = "";
  }
  return logoCheckoutCache;
}

function asaasPronta() {
  const key = String(process.env.ASAAS_API_KEY || "").trim();
  if (!key || key.includes("xxxxx")) return false;
  return true;
}

function linkPlanoUtil(url) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return "";
  if (u.includes("xxxxx")) return "";
  return u;
}

function digitosDocumento(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function documentoValido(valor) {
  const d = digitosDocumento(valor);
  if (d.length === 11) return cpfValido(d);
  if (d.length === 14) return cnpjValido(d);
  return false;
}

function cpfValido(d) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i += 1) soma += Number(d[i]) * (10 - i);
  let dig = (soma * 10) % 11;
  if (dig === 10) dig = 0;
  if (dig !== Number(d[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i += 1) soma += Number(d[i]) * (11 - i);
  dig = (soma * 10) % 11;
  if (dig === 10) dig = 0;
  return dig === Number(d[10]);
}

function cnpjValido(d) {
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (base) => {
    let soma = 0;
    let pos = base.length - 7;
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * pos;
      pos -= 1;
      if (pos < 2) pos = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(d.slice(0, 12)) === Number(d[12]) && calc(d.slice(0, 13)) === Number(d[13]);
}

function dataFutura(iso) {
  const d = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return d > dataIso() ? d : "";
}

function montarCorpoCheckout({ plano, userId, origem, customerId, nextDueDate }) {
  const item = {
    name: plano.id === "anual" ? "Plano anual" : "Plano mensal",
    description:
      plano.id === "anual"
        ? "R$ 130,80 no ano. No cartão, até 12x de R$ 10,90."
        : "R$ 17,90 por mês no cartão. Cancele quando quiser.",
    quantity: 1,
    value: plano.valor,
    externalReference: plano.id
  };
  const imagem = logoCheckoutBase64();
  if (imagem) item.imageBase64 = imagem;

  const base = String(origem || "https://myrep.com.br").replace(/\/$/, "");
  const corpo = {
    billingTypes: plano.id === "anual" ? ["PIX", "CREDIT_CARD"] : ["CREDIT_CARD"],
    chargeTypes: plano.id === "anual" ? ["DETACHED", "INSTALLMENT"] : ["RECURRENT"],
    minutesToExpire: 180,
    externalReference: referenciaCheckout(userId, plano.id),
    callback: {
      successUrl: `${base}/pagamento/ok/?plano=${encodeURIComponent(plano.id)}`,
      cancelUrl: `${base}/painel/`,
      expiredUrl: `${base}/painel/`
    },
    items: [item]
  };
  if (customerId) corpo.customer = customerId;

  if (plano.id === "anual") {
    corpo.installment = { maxInstallmentCount: plano.parcelas || 12 };
  } else {
    corpo.subscription = {
      cycle: "MONTHLY",
      nextDueDate: dataFutura(nextDueDate) || dataIso()
    };
  }

  return corpo;
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
  identificarPlanoPorValor,
  referenciaCheckout,
  lerReferenciaCheckout,
  dataIso,
  dataFutura,
  somarUmAno,
  proximaCobrancaDoPlano,
  sitePublico,
  asaasPronta,
  linkPlanoUtil,
  montarCorpoCheckout,
  digitosDocumento,
  documentoValido,
  adminSenhaOk,
  emitirSessaoAdmin,
  lerSessaoAdmin,
  cookieValor,
  valoresIguais
};
