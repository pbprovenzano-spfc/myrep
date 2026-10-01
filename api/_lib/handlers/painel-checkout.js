/* =========================================================
   POST /api/painel/checkout — cliente Asaas + link de pagamento
   ========================================================= */

const {
  PLANOS,
  linksPlanos,
  lerJsonBody,
  json,
  asaasFetch,
  asaasPronta,
  linkPlanoUtil,
  sitePublico,
  montarCorpoCheckout,
  buscarClientePorEmail
} = require("../pagamento");
const { getSupabase, supabaseConfigured } = require("../supabase");
const { exigirUsuario } = require("../auth");
const { upsertAssinatura, obterAssinaturaPorUserId } = require("../assinaturas");
const {
  cobrancaDeUsuario,
  mesclarCobranca,
  validarCobranca,
  lerCobranca,
  metadataDeCobranca,
  clienteAsaasDeCobranca
} = require("../cobranca");

async function garantirClienteAsaas({ customerId, email, userId, cobranca }) {
  const payload = clienteAsaasDeCobranca(cobranca, { email, userId });
  if (customerId) {
    try {
      const atualizado = await asaasFetch(`/customers/${encodeURIComponent(customerId)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      return atualizado?.id || customerId;
    } catch (erro) {
      console.error("checkout atualizar cliente:", erro.message || erro);
    }
  }

  const existente = await buscarClientePorEmail(email);
  if (existente?.id) {
    const atualizado = await asaasFetch(`/customers/${encodeURIComponent(existente.id)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return atualizado?.id || existente.id;
  }

  const criado = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (!criado?.id) {
    const erro = new Error("A Asaas não devolveu o cliente.");
    erro.status = 502;
    throw erro;
  }
  return criado.id;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const { user } = await exigirUsuario(req);
    const body = await lerJsonBody(req);
    const planoId = String(body.plano || "").trim();
    const plano = PLANOS[planoId];
    if (!plano) {
      return json(res, 400, { erro: "Plano inválido." });
    }
    if (plano.checkout === false) {
      return json(res, 400, { erro: "Este plano não possui checkout." });
    }

    const email = String(user.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      return json(res, 400, { erro: "Conta sem e-mail." });
    }

    const assinaturaAtual = await obterAssinaturaPorUserId(user.id);
    if (assinaturaAtual?.status === "ativa") {
      return json(res, 409, { erro: "Você já possui assinatura ativa." });
    }

    const cobranca = mesclarCobranca(cobrancaDeUsuario(user), lerCobranca(body.cobranca || body));
    const erroCobranca = validarCobranca(cobranca);
    if (erroCobranca) {
      return json(res, 400, { erro: erroCobranca });
    }

    let customerId = assinaturaAtual?.asaas_customer_id || null;
    let linkPagamento = "";

    if (asaasPronta()) {
      customerId = await garantirClienteAsaas({
        customerId,
        email,
        userId: user.id,
        cobranca
      });
      const checkout = await asaasFetch("/checkouts", {
        method: "POST",
        body: JSON.stringify(
          montarCorpoCheckout({
            plano,
            userId: user.id,
            origem: sitePublico(req),
            customerId
          })
        )
      });
      linkPagamento = checkout?.link || "";
      if (!linkPagamento) {
        return json(res, 502, { erro: "A Asaas não devolveu o link de pagamento." });
      }
    } else {
      linkPagamento = linkPlanoUtil(linksPlanos()[planoId]);
      if (!linkPagamento) {
        return json(res, 400, {
          erro: "Pagamento Asaas ainda não configurado. Cadastre a ASAAS_API_KEY no servidor."
        });
      }
      const sep = linkPagamento.includes("?") ? "&" : "?";
      linkPagamento = `${linkPagamento}${sep}email=${encodeURIComponent(email)}`;
    }

    if (supabaseConfigured()) {
      try {
        await getSupabase().auth.admin.updateUserById(user.id, {
          user_metadata: { ...(user.user_metadata || {}), ...metadataDeCobranca(cobranca) }
        });
      } catch (erroMeta) {
        console.error("checkout cobranca:", erroMeta.message || erroMeta);
      }
    }

    await upsertAssinatura(user.id, {
      plano: planoId,
      status: "pendente",
      asaas_customer_id: customerId
    });

    return json(res, 200, {
      ok: true,
      plano: planoId,
      linkPagamento
    });
  } catch (erro) {
    console.error("checkout:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro no checkout." });
  }
};
