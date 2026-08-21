const { lerJsonBody, json, PLANOS, valoresIguais, asaasFetch } = require("../_lib/pagamento");
const {
  registrarPagamentoEvento,
  registrarAcesso,
  jaEnviouEmailPagamento,
  EVENTO_EMAIL_PAGAMENTO
} = require("../_lib/acessos");
const {
  marcarAdimplentePorEmail,
  marcarInadimplentePorEmail
} = require("../_lib/paginas");
const { buscarUsuarioPorEmail } = require("../_lib/auth");
const {
  upsertAssinatura,
  associarUserIdPorEmail,
  obterAssinaturaPorUserId
} = require("../_lib/assinaturas");

function identificarPlano(pagamento) {
  if (!pagamento || pagamento.value == null) return null;
  for (const plano of Object.values(PLANOS)) {
    if (plano.checkout === false) continue;
    if (valoresIguais(pagamento.value, plano.valor)) return plano;
  }
  return null;
}

async function sincronizarContaPorEmail(email, {
  planoId,
  status,
  customerId,
  subscriptionId,
  paymentId,
  proximaCobranca
} = {}) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return null;

  const user = await buscarUsuarioPorEmail(e);
  if (!user) return null;

  const assinaturaAtual = await obterAssinaturaPorUserId(user.id);
  if (assinaturaAtual?.plano === "vitalicio" && assinaturaAtual?.status === "ativa") {
    return user;
  }

  await upsertAssinatura(user.id, {
    plano: planoId || "mensal",
    status: status || "ativa",
    asaas_customer_id: customerId || null,
    asaas_subscription_id: subscriptionId || null,
    asaas_payment_id: paymentId || null,
    proxima_cobranca: proximaCobranca || null
  });

  try {
    await associarUserIdPorEmail(e, user.id);
  } catch (erroAssoc) {
    console.error("Webhook associar user_id:", erroAssoc.message || erroAssoc);
  }

  return user;
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
          try {
            await sincronizarContaPorEmail(email, {
              planoId: plano.id,
              status: "ativa",
              customerId: pagamento.customer,
              subscriptionId: pagamento.subscription || null,
              paymentId: pagamento.id,
              proximaCobranca: pagamento.nextDueDate || pagamento.dueDate || null
            });
          } catch (erroConta) {
            console.error("Webhook conta:", erroConta.message || erroConta);
          }

          if (process.env.RESEND_API_KEY && pagamento.id) {
            try {
              const jaEnviou = await jaEnviouEmailPagamento(pagamento.id);
              if (!jaEnviou) {
                const { Resend } = require("resend");
                const resend = new Resend(process.env.RESEND_API_KEY);
                const de = process.env.BRIEFING_FROM_EMAIL || "My Rep <onboarding@resend.dev>";
                const suporte =
                  process.env.SUPPORT_EMAIL ||
                  process.env.BRIEFING_TO_EMAIL ||
                  "myrep.sup@gmail.com";
                const valorTexto = plano.descricao || `R$ ${pagamento.value ?? "—"}`;
                const { error: erroEnvio } = await resend.emails.send({
                  from: de,
                  to: [email],
                  subject: `Pagamento confirmado — plano ${plano.nome} | My Rep`,
                  text: [
                    "Olá,",
                    "",
                    `Seu pagamento do plano ${plano.nome} (${valorTexto}) foi confirmado.`,
                    "",
                    "Acesse o painel para montar e publicar sua página:",
                    "https://myrep.com.br/painel/",
                    "",
                    "Se ainda não estiver logado:",
                    "https://myrep.com.br/entrar/?next=/painel/",
                    "",
                    `Dúvidas? Escreva para ${suporte}.`,
                    "",
                    "— Equipe My Rep"
                  ].join("\n")
                });
                if (erroEnvio) {
                  console.error("Webhook e-mail cliente:", erroEnvio.message || erroEnvio);
                } else {
                  await registrarPagamentoEvento({
                    event: EVENTO_EMAIL_PAGAMENTO,
                    paymentId: pagamento.id,
                    payload: { email, plano: plano.id }
                  });
                }
              }
            } catch (erroEmailCliente) {
              console.error("Webhook e-mail cliente:", erroEmailCliente.message || erroEmailCliente);
            }
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
          let pularOverdue = false;
          const userOverdue = await buscarUsuarioPorEmail(cliente.email);
          if (userOverdue) {
            const assVitalicio = await obterAssinaturaPorUserId(userOverdue.id);
            if (assVitalicio?.plano === "vitalicio" && assVitalicio?.status === "ativa") {
              pularOverdue = true;
            }
          }
          if (!pularOverdue) {
            await marcarInadimplentePorEmail(cliente.email);
            const planoOverdue = identificarPlano(pagamento);
            await sincronizarContaPorEmail(cliente.email, {
              planoId: planoOverdue?.id,
              status: "inadimplente",
              customerId: pagamento.customer,
              subscriptionId: pagamento.subscription || null,
              paymentId: pagamento.id
            });
          }
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
