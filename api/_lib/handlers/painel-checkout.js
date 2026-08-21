/* =========================================================
   POST /api/painel/checkout — link de pagamento Asaas
   ========================================================= */

const {
  PLANOS,
  linksPlanos,
  lerJsonBody,
  json,
  asaasFetch,
  buscarClientePorEmail
} = require("../pagamento");
const { exigirUsuario } = require("../auth");
const { upsertAssinatura, obterAssinaturaPorUserId } = require("../assinaturas");

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

    const links = linksPlanos();
    let linkPagamento = links[planoId] || "";
    let customerId = null;

    const assinaturaAtual = await obterAssinaturaPorUserId(user.id);
    if (assinaturaAtual?.status === "ativa") {
      return json(res, 409, { erro: "Você já possui assinatura ativa." });
    }

    if (!linkPagamento) {
      return json(res, 400, {
        erro: "Link de pagamento não configurado para este plano. Contate o suporte.",
        plano: planoId
      });
    }

    if (process.env.ASAAS_API_KEY) {
      try {
        let cliente = await buscarClientePorEmail(email);
        if (!cliente) {
          const nome =
            user.user_metadata?.nome ||
            user.user_metadata?.full_name ||
            email.split("@")[0];
          cliente = await asaasFetch("/customers", {
            method: "POST",
            body: JSON.stringify({
              name: nome,
              email,
              notificationDisabled: false
            })
          });
        }
        customerId = cliente?.id || null;
      } catch (erroCliente) {
        console.error("checkout customer:", erroCliente.message || erroCliente);
      }
    }

    await upsertAssinatura(user.id, {
      plano: planoId,
      status: "pendente",
      asaas_customer_id: customerId
    });

    // Prefill email quando o link Asaas aceita query (nem todos aceitam)
    const sep = linkPagamento.includes("?") ? "&" : "?";
    const comEmail = `${linkPagamento}${sep}email=${encodeURIComponent(email)}`;

    return json(res, 200, {
      ok: true,
      plano: planoId,
      linkPagamento: comEmail,
      customerId
    });
  } catch (erro) {
    console.error("checkout:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro no checkout." });
  }
};
