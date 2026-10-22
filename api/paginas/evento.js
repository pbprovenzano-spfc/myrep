/* =========================================================
   POST /api/paginas/evento — conta visita ou clique no WhatsApp
   Enviado por navigator.sendBeacon na página pública. Sem cookie e
   sem dado do visitante: só soma 1 no total do dia (estatisticas_diarias).
   ========================================================= */

const { lerJsonBody } = require("../_lib/pagamento");
const { getSupabase, supabaseConfigured } = require("../_lib/supabase");
const { normalizarSlug, RESERVADOS } = require("../_lib/slugs");

const TIPOS = new Set(["visita", "whatsapp"]);
// Robôs de busca e de prévia de link (inclusive o do WhatsApp) não contam.
const ROBO = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless/i;

function responder(res, status) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return lerJsonBody(req);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return responder(res, 405);

  let corpo;
  try {
    corpo = await lerCorpo(req);
  } catch {
    return responder(res, 400);
  }

  const slug = normalizarSlug(corpo?.slug || "");
  const tipo = String(corpo?.tipo || "");
  if (!slug || !TIPOS.has(tipo) || RESERVADOS.has(slug)) return responder(res, 400);
  if (slug.startsWith("exemplo") || ROBO.test(String(req.headers["user-agent"] || ""))) {
    return responder(res, 204);
  }
  if (!supabaseConfigured()) return responder(res, 204);

  try {
    const { error } = await getSupabase().rpc("registrar_estatistica", { p_slug: slug, p_tipo: tipo });
    if (error) console.error("paginas/evento:", error.message);
  } catch (erro) {
    console.error("paginas/evento:", erro.message || erro);
  }
  return responder(res, 204);
};

module.exports.config = {
  api: { bodyParser: false }
};
