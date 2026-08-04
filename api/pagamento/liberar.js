const {
  PLANOS,
  emitirToken,
  encontrarPagamentoDoPlano,
  lerJsonBody,
  json
} = require("../_lib/pagamento");
const { registrarAcesso } = require("../_lib/acessos");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const body = await lerJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const plano = String(body.plano || "").trim();

    if (!email || !email.includes("@")) {
      return json(res, 400, { erro: "Informe um e-mail válido." });
    }
    if (!PLANOS[plano]) {
      return json(res, 400, { erro: "Plano inválido." });
    }

    const { pagamento, cliente } = await encontrarPagamentoDoPlano(email, plano);
    const token = emitirToken({
      email,
      plano,
      paymentId: pagamento.id,
      dias: 7
    });

    await registrarAcesso({
      email,
      plano,
      paymentId: pagamento.id,
      asaasCustomerId: cliente.id,
      token,
      dias: 7,
      origem: "liberar"
    });

    return json(res, 200, {
      ok: true,
      token,
      plano,
      pagamentoId: pagamento.id,
      cliente: {
        id: cliente.id,
        nome: cliente.name,
        email: cliente.email
      },
      briefingUrl: `/briefing/?acesso=${encodeURIComponent(token)}`
    });
  } catch (erro) {
    console.error("liberar:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro ao liberar acesso." });
  }
};
