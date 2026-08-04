const crypto = require("crypto");
const { getSupabase, supabaseConfigured } = require("./supabase");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function registrarAcesso({
  email,
  plano,
  paymentId,
  asaasCustomerId,
  token,
  dias = 7,
  origem
}) {
  if (!supabaseConfigured()) return null;
  const sb = getSupabase();
  const expira_em = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("acessos")
    .insert({
      email: String(email).trim().toLowerCase(),
      plano,
      payment_id: paymentId || null,
      asaas_customer_id: asaasCustomerId || null,
      token_hash: token ? hashToken(token) : null,
      expira_em,
      origem
    })
    .select()
    .single();
  if (error) {
    console.error("registrarAcesso:", error.message);
    return null;
  }
  return data;
}

async function listarAcessos({ limit = 50 } = {}) {
  if (!supabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("acessos")
    .select("id, email, plano, payment_id, asaas_customer_id, expira_em, origem, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listarAcessos:", error.message);
    return [];
  }
  return data || [];
}

async function registrarPagamentoEvento({ event, paymentId, payload }) {
  if (!supabaseConfigured()) return false;
  const sb = getSupabase();
  const { error } = await sb.from("pagamentos_eventos").insert({
    event: event || "unknown",
    payment_id: paymentId || null,
    payload: payload || {}
  });
  if (error) {
    console.error("registrarPagamentoEvento:", error.message);
    return false;
  }
  return true;
}

module.exports = {
  hashToken,
  registrarAcesso,
  listarAcessos,
  registrarPagamentoEvento
};
