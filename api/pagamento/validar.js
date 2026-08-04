const { lerToken, lerJsonBody, json, PLANOS } = require("../_lib/pagamento");

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const pagamentoAtivo = !!(process.env.PAGAMENTO_TOKEN_SECRET || process.env.ASAAS_API_KEY);
    if (!pagamentoAtivo) {
      return json(res, 200, { ok: true, modo: "dev", plano: "mensal", planoNome: "Dev (sem Asaas)" });
    }

    let token = "";
    if (req.method === "GET") {
      const u = new URL(req.url, "http://localhost");
      token = u.searchParams.get("acesso") || u.searchParams.get("token") || "";
    } else {
      const body = await lerJsonBody(req);
      token = body.token || body.acesso || "";
    }

    const dados = lerToken(token);
    const plano = PLANOS[dados.plano];

    return json(res, 200, {
      ok: true,
      email: dados.email,
      plano: dados.plano,
      planoNome: plano.nome,
      paymentId: dados.paymentId,
      exp: dados.exp
    });
  } catch (erro) {
    return json(res, erro.status || 401, { ok: false, erro: erro.message || "Acesso negado." });
  }
};
