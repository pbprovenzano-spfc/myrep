const { lerJsonBody, json, PLANOS, valoresIguais, asaasFetch } = require("../_lib/pagamento");
const { registrarPagamentoEvento, registrarAcesso } = require("../_lib/acessos");
const {
  marcarAdimplentePorEmail,
  marcarInadimplentePorEmail
} = require("../_lib/paginas");

function identificarPlano(pagamento) {
  if (!pagamento || pagamento.value == null) return null;
  for (const plano of Object.values(PLANOS)) {
    if (valoresIguais(pagamento.value, plano.valor)) return plano;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const tokenEsperado = process.env.ASAAS_WEBHOOK_TOKEN;
    if (tokenEsperado) {
      const recebido = req.headers["asaas-access-token"] || req.headers["access_token"];
      if (recebido !== tokenEsperado) {
        return json(res, 401, { erro: "Webhook não autorizado." });
      }
    }

    const body = await lerJsonBody(req);
    const evento = body.event || "";
    const pagamento = body.payment || null;
    const plano = identificarPlano(pagamento);

    await registrarPagamentoEvento({
      event: evento,
      paymentId: pagamento?.id || null,
      payload: body
    });

    console.log("Asaas webhook:", evento, pagamento?.id, plano?.id || "plano?");

    if (
      (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") &&
      plano &&
      pagamento?.customer &&
      process.env.ASAAS_API_KEY
    ) {
      try {
        const cliente = await asaasFetch(`/customers/${encodeURIComponent(pagamento.customer)}`);
        const email = cliente?.email;
        if (email) {
          await registrarAcesso({
            email,
            plano: plano.id,
            paymentId: pagamento.id,
            asaasCustomerId: pagamento.customer,
            token: null,
            dias: 14,
            origem: "webhook"
          });
          try {
            await marcarAdimplentePorEmail(email);
          } catch (erroPaginas) {
            console.error("Webhook reativar páginas:", erroPaginas.message || erroPaginas);
          }
        }
      } catch (erroCliente) {
        console.error("Webhook cliente:", erroCliente.message || erroCliente);
      }
    }

    if (
      (evento === "PAYMENT_OVERDUE" || evento === "PAYMENT_UPDATED") &&
      pagamento?.customer &&
      process.env.ASAAS_API_KEY &&
      String(pagamento?.status || "").toUpperCase() === "OVERDUE"
    ) {
      try {
        const cliente = await asaasFetch(`/customers/${encodeURIComponent(pagamento.customer)}`);
        if (cliente?.email) {
          await marcarInadimplentePorEmail(cliente.email);
        }
      } catch (erroOverdue) {
        console.error("Webhook overdue páginas:", erroOverdue.message || erroOverdue);
      }
    }

    if (
      (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") &&
      process.env.RESEND_API_KEY
    ) {
      try {
        const { Resend } = require("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const de = process.env.BRIEFING_FROM_EMAIL || "My Rep <onboarding@resend.dev>";
        const para = process.env.BRIEFING_TO_EMAIL || "myrep.sup@gmail.com";
        await resend.emails.send({
          from: de,
          to: [para],
          subject: `My Rep pagamento — ${plano ? plano.nome : "cobrança"} (${pagamento?.id || "?"})`,
          text: [
            `Evento: ${evento}`,
            `Pagamento: ${pagamento?.id || "—"}`,
            `Status: ${pagamento?.status || "—"}`,
            `Valor: R$ ${pagamento?.value ?? "—"}`,
            `Plano: ${plano ? plano.nome : "não identificado"}`,
            `Cliente Asaas: ${pagamento?.customer || "—"}`,
            `Billing: ${pagamento?.billingType || "—"}`,
            ``,
            `Painel: /admin/`
          ].join("\n")
        });
      } catch (erroEmail) {
        console.error("Webhook e-mail:", erroEmail.message || erroEmail);
      }
    }

    return json(res, 200, { received: true });
  } catch (erro) {
    console.error("webhook:", erro);
    return json(res, 200, { received: true, aviso: erro.message });
  }
};
