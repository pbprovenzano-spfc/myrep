/* =========================================================
   PUT /api/painel/cartao — troca o cartão da assinatura recorrente
   O corpo desta requisição nunca é registrado nem armazenado.
   ========================================================= */

const { json, lerJsonBody, asaasFetch, asaasPronta, PLANOS } = require("../pagamento");
const { exigirUsuario } = require("../auth");
const { obterAssinaturaPorUserId } = require("../assinaturas");
const {
  cobrancaDeUsuario,
  validarCobranca,
  titularAsaasDeCobranca
} = require("../cobranca");
const { lerCartao, validarCartao, ipDoCliente } = require("../cartao");

module.exports = async function handler(req, res) {
  if (req.method !== "PUT" && req.method !== "POST") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const { user } = await exigirUsuario(req);
    if (!asaasPronta()) {
      return json(res, 503, { erro: "Pagamento Asaas ainda não configurado." });
    }

    const assinatura = await obterAssinaturaPorUserId(user.id);
    if (!assinatura) {
      return json(res, 404, { erro: "Você não tem assinatura." });
    }
    if (PLANOS[assinatura.plano]?.tipo !== "recorrente") {
      return json(res, 400, {
        erro: "Só o plano mensal tem cartão salvo. No anual, o cartão é informado em cada pagamento."
      });
    }
    if (!assinatura.asaas_subscription_id) {
      return json(res, 409, {
        erro: "Não encontramos a recorrência na Asaas. Fale com o suporte."
      });
    }

    const cobranca = cobrancaDeUsuario(user);
    const erroCobranca = validarCobranca(cobranca);
    if (erroCobranca) {
      return json(res, 400, { erro: `Complete os dados de cobrança antes: ${erroCobranca}` });
    }

    const cartao = lerCartao(await lerJsonBody(req));
    const erroCartao = validarCartao(cartao);
    if (erroCartao) {
      return json(res, 400, { erro: erroCartao });
    }

    const corpo = {
      creditCard: {
        holderName: cartao.titular,
        number: cartao.numero,
        expiryMonth: cartao.mes,
        expiryYear: cartao.ano,
        ccv: cartao.cvv
      },
      creditCardHolderInfo: titularAsaasDeCobranca(cobranca, {
        email: String(user.email || "").toLowerCase()
      })
    };
    const ip = ipDoCliente(req);
    if (ip) corpo.remoteIp = ip;

    const atualizada = await asaasFetch(
      `/subscriptions/${encodeURIComponent(assinatura.asaas_subscription_id)}/creditCard`,
      { method: "PUT", body: JSON.stringify(corpo) }
    );

    const cc = atualizada?.creditCard || {};
    const ultimos = String(cc.creditCardNumber || "").replace(/\D/g, "").slice(-4) ||
      cartao.numero.slice(-4);

    return json(res, 200, {
      ok: true,
      cartao: { bandeira: String(cc.creditCardBrand || "").toUpperCase(), ultimos },
      aviso: "Cartão atualizado. As próximas cobranças usam este cartão."
    });
  } catch (erro) {
    console.error("painel cartao:", erro.message || "falha ao trocar cartão");
    return json(res, erro.status || 500, { erro: erro.message || "Erro ao trocar o cartão." });
  }
};
