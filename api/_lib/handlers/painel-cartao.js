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

function soDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function luhnOk(numero) {
  let soma = 0;
  let dobra = false;
  for (let i = numero.length - 1; i >= 0; i -= 1) {
    let d = Number(numero[i]);
    if (dobra) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    dobra = !dobra;
  }
  return soma % 10 === 0;
}

function lerCartao(body) {
  const b = body && typeof body === "object" ? body : {};
  const numero = soDigitos(b.numero);
  const mes = soDigitos(b.mes).slice(0, 2);
  let ano = soDigitos(b.ano).slice(0, 4);
  if (ano.length === 2) ano = `20${ano}`;
  return {
    titular: String(b.titular || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80),
    numero,
    mes: mes.padStart(2, "0"),
    ano,
    cvv: soDigitos(b.cvv).slice(0, 4)
  };
}

function validarCartao(cartao) {
  if (cartao.titular.length < 3) return "Informe o nome impresso no cartão.";
  if (cartao.numero.length < 13 || cartao.numero.length > 19 || !luhnOk(cartao.numero)) {
    return "Número do cartão inválido.";
  }
  const mes = Number(cartao.mes);
  if (!(mes >= 1 && mes <= 12)) return "Mês de validade inválido.";
  const ano = Number(cartao.ano);
  if (!(ano >= 2000 && ano <= 2100)) return "Ano de validade inválido.";
  const agora = new Date();
  const fimDoMes = new Date(Date.UTC(ano, mes, 1));
  if (fimDoMes <= agora) return "Este cartão já venceu.";
  if (cartao.cvv.length < 3) return "Informe o código de segurança (CVV).";
  return "";
}

function ipDoCliente(req) {
  const bruto = String(
    req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || ""
  ).split(",")[0].trim();
  if (!bruto || /^(127\.|10\.|192\.168\.|::1$)/.test(bruto)) return "";
  return bruto;
}

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
