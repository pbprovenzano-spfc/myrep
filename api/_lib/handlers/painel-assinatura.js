/* =========================================================
   GET/DELETE /api/painel/assinatura — resumo, cartão, histórico e cancelamento
   ========================================================= */

const {
  json,
  PLANOS,
  asaasFetch,
  asaasPronta,
  listarPagamentosCliente,
  dataIso
} = require("../pagamento");
const { exigirUsuario } = require("../auth");
const {
  obterAssinaturaPorUserId,
  upsertAssinatura,
  expirarSeVencido
} = require("../assinaturas");
const { cobrancaDeUsuario, respostaCobranca } = require("../cobranca");

function dataValida(iso) {
  const d = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function resumoAssinatura(assinatura) {
  if (!assinatura) return null;
  const plano = PLANOS[assinatura.plano] || null;
  return {
    plano: assinatura.plano,
    planoNome: plano?.nome || assinatura.plano,
    planoLabel: plano?.descricao || "",
    recorrente: plano?.tipo === "recorrente",
    status: assinatura.status,
    proxima_cobranca: assinatura.proxima_cobranca,
    cancelamento_agendado: assinatura.cancelamento_agendado === true,
    temAsaas: !!assinatura.asaas_subscription_id
  };
}

function resumoCartao(assinaturaAsaas) {
  const cc = assinaturaAsaas?.creditCard;
  const ultimos = String(cc?.creditCardNumber || "").replace(/\D/g, "").slice(-4);
  if (!ultimos) return null;
  return { bandeira: String(cc.creditCardBrand || "").toUpperCase(), ultimos };
}

function resumoPagamento(pagamento) {
  return {
    id: pagamento.id || "",
    valor: Number(pagamento.value) || 0,
    status: String(pagamento.status || ""),
    tipo: String(pagamento.billingType || ""),
    vencimento: dataValida(pagamento.dueDate),
    pagoEm: dataValida(pagamento.paymentDate || pagamento.clientPaymentDate) || null,
    parcela: pagamento.installmentNumber || null,
    faturaUrl: pagamento.invoiceUrl || "",
    reciboUrl: pagamento.transactionReceiptUrl || ""
  };
}

/* A Asaas é a fonte da verdade da data: o webhook pode atrasar. */
async function sincronizarProximaCobranca(assinatura, assinaturaAsaas) {
  const nova = dataValida(assinaturaAsaas?.nextDueDate);
  const atual = dataValida(assinatura.proxima_cobranca);
  if (!nova || nova === atual) return assinatura;
  const atualizada = await upsertAssinatura(assinatura.user_id, { proxima_cobranca: nova });
  return atualizada || { ...assinatura, proxima_cobranca: nova };
}

async function buscarNaAsaas(assinatura) {
  if (!asaasPronta() || !assinatura?.asaas_subscription_id) return null;
  try {
    return await asaasFetch(`/subscriptions/${encodeURIComponent(assinatura.asaas_subscription_id)}`);
  } catch (erro) {
    console.error("painel assinatura asaas:", erro.message || erro);
    return null;
  }
}

async function buscarHistorico(assinatura) {
  if (!asaasPronta() || !assinatura?.asaas_customer_id) return [];
  try {
    const lista = await listarPagamentosCliente(assinatura.asaas_customer_id, { limit: 24 });
    return lista
      .map(resumoPagamento)
      .sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)));
  } catch (erro) {
    console.error("painel assinatura historico:", erro.message || erro);
    return [];
  }
}

async function cancelarNaAsaas(subscriptionId) {
  if (!asaasPronta() || !subscriptionId) return;
  try {
    await asaasFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
  } catch (erro) {
    // 404 significa que a recorrência já não existe na Asaas — segue o cancelamento local.
    if (erro.httpStatus === 404) return;
    throw erro;
  }
}

async function responderResumo(res, user, assinatura) {
  const naAsaas = await buscarNaAsaas(assinatura);
  const atual = naAsaas ? await sincronizarProximaCobranca(assinatura, naAsaas) : assinatura;
  return json(res, 200, {
    ok: true,
    email: String(user.email || "").toLowerCase(),
    nome: user.user_metadata?.nome || user.user_metadata?.full_name || null,
    assinatura: resumoAssinatura(atual),
    cartao: resumoCartao(naAsaas),
    cobranca: respostaCobranca(cobrancaDeUsuario(user)),
    historico: await buscarHistorico(atual)
  });
}

module.exports = async function handler(req, res) {
  try {
    const { user } = await exigirUsuario(req);
    let assinatura = await obterAssinaturaPorUserId(user.id);
    if (assinatura) assinatura = await expirarSeVencido(assinatura);

    if (req.method === "GET") {
      if (!assinatura) {
        return json(res, 200, {
          ok: true,
          email: String(user.email || "").toLowerCase(),
          nome: user.user_metadata?.nome || user.user_metadata?.full_name || null,
          assinatura: null,
          cartao: null,
          cobranca: respostaCobranca(cobrancaDeUsuario(user)),
          historico: []
        });
      }
      return responderResumo(res, user, assinatura);
    }

    if (req.method !== "DELETE") {
      return json(res, 405, { erro: "Método não permitido" });
    }

    if (!assinatura) {
      return json(res, 404, { erro: "Você não tem assinatura para cancelar." });
    }
    if (assinatura.plano === "vitalicio") {
      return json(res, 400, { erro: "O plano vitalício não tem cobrança para cancelar." });
    }
    if (!["ativa", "inadimplente"].includes(assinatura.status)) {
      return json(res, 400, { erro: "Esta assinatura já não está vigente." });
    }
    if (assinatura.cancelamento_agendado === true) {
      return json(res, 409, { erro: "O cancelamento já está agendado." });
    }

    await cancelarNaAsaas(assinatura.asaas_subscription_id);

    const limite = dataValida(assinatura.proxima_cobranca);
    const ate = assinatura.status === "ativa" && limite > dataIso() ? limite : "";

    const atualizada = await upsertAssinatura(user.id, {
      status: ate ? assinatura.status : "cancelada",
      cancelamento_agendado: true,
      asaas_subscription_id: null
    });

    return json(res, 200, {
      ok: true,
      ate: ate || null,
      assinatura: resumoAssinatura(atualizada || { ...assinatura, cancelamento_agendado: true }),
      aviso: ate
        ? "Cancelamento confirmado. Não haverá novas cobranças e sua página fica no ar até o fim do período pago."
        : "Cancelamento confirmado. Não haverá novas cobranças."
    });
  } catch (erro) {
    console.error("painel assinatura:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro na assinatura." });
  }
};
