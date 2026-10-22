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

const EVENTO_EMAIL_PAGAMENTO = "EMAIL_PAGAMENTO_ENVIADO";

/** Já existe um evento `event` para esta chave (id de cobrança ou de usuário)? */
async function jaRegistrouEvento(event, chave) {
  if (!chave || !supabaseConfigured()) return false;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("pagamentos_eventos")
    .select("id")
    .eq("payment_id", String(chave))
    .eq("event", event)
    .limit(1);
  if (error) {
    console.error("jaRegistrouEvento:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/** Chaves (entre as informadas) que já têm algum dos eventos — uma consulta só. */
async function chavesComEventos(eventos, chaves) {
  const lista = [...new Set((chaves || []).map(String).filter(Boolean))];
  const encontrados = new Map(eventos.map((e) => [e, new Set()]));
  if (!lista.length || !supabaseConfigured()) return encontrados;
  const sb = getSupabase();
  for (let i = 0; i < lista.length; i += 200) {
    const { data, error } = await sb
      .from("pagamentos_eventos")
      .select("event, payment_id")
      .in("event", eventos)
      .in("payment_id", lista.slice(i, i + 200));
    if (error) {
      console.error("chavesComEventos:", error.message);
      continue;
    }
    for (const row of data || []) encontrados.get(row.event)?.add(row.payment_id);
  }
  return encontrados;
}

async function jaEnviouEmailPagamento(paymentId) {
  return jaRegistrouEvento(EVENTO_EMAIL_PAGAMENTO, paymentId);
}

module.exports = {
  hashToken,
  registrarAcesso,
  listarAcessos,
  registrarPagamentoEvento,
  jaEnviouEmailPagamento,
  jaRegistrouEvento,
  chavesComEventos,
  EVENTO_EMAIL_PAGAMENTO
};
