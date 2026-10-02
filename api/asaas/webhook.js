const {
  lerJsonBody,
  json,
  PLANOS,
  asaasFetch,
  identificarPlanoPorValor,
  lerReferenciaCheckout,
  proximaCobrancaDoPlano
} = require("../_lib/pagamento");
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
const { buscarUsuarioPorEmail, buscarUsuarioPorId } = require("../_lib/auth");
const {
  upsertAssinatura,
  associarUserIdPorEmail,
  obterAssinaturaPorUserId
} = require("../_lib/assinaturas");

function identificarPlano(pagamento) {
  if (!pagamento) return null;
  const ref = lerReferenciaCheckout(pagamento.externalReference);
  if (ref && PLANOS[ref.planoId]) return PLANOS[ref.planoId];
  return identificarPlanoPorValor(pagamento.value);
}

function planoDoCheckout(checkout) {
  if (!checkout) return { plano: null, userId: null };
  const ref = lerReferenciaCheckout(checkout.externalReference);
  const porItem = identificarPlanoPorValor(checkout.items?.[0]?.value);
  const plano = (ref && PLANOS[ref.planoId]) || porItem || null;
  return { plano, userId: ref?.userId || null };
}

async function encerrarRecorrencia(subscriptionId) {
  if (!subscriptionId || !process.env.ASAAS_API_KEY) return;
  try {
    await asaasFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
  } catch (erro) {
    console.error("Webhook encerrar recorrência:", erro.message || erro);
  }
}

async function sincronizarContaPorEmail(email, {
  userId,
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

  let user = null;
  if (userId) user = { id: userId };
  else if (e) user = await buscarUsuarioPorEmail(e);
  if (!user?.id) return null;

  const assinaturaAtual = await obterAssinaturaPorUserId(user.id);
  if (assinaturaAtual?.plano === "vitalicio" && assinaturaAtual?.status === "ativa") {
    return user;
  }

  const planoEfetivo = planoId || assinaturaAtual?.plano || null;
  const proxima = proximaCobrancaDoPlano(
    planoEfetivo,
    assinaturaAtual,
    proximaCobranca,
    status || "ativa"
  );

  // Troca de plano: a recorrência antiga pararia de ser usada, mas continuaria cobrando.
  let recorrenciaAnterior = assinaturaAtual?.asaas_subscription_id || null;
  const trocouDePlano = planoId && assinaturaAtual?.plano && planoId !== assinaturaAtual.plano;
  if (trocouDePlano && recorrenciaAnterior && recorrenciaAnterior !== subscriptionId) {
    await encerrarRecorrencia(recorrenciaAnterior);
    recorrenciaAnterior = null;
  }

  const patch = {
    status: status || "ativa",
    asaas_customer_id: customerId || assinaturaAtual?.asaas_customer_id || null,
    asaas_subscription_id: subscriptionId || recorrenciaAnterior || null,
    asaas_payment_id: paymentId || assinaturaAtual?.asaas_payment_id || null
  };
  if (planoId) patch.plano = planoId;
  if (proxima) patch.proxima_cobranca = proxima;
  if ((status || "ativa") === "ativa") patch.cancelamento_agendado = false;

  await upsertAssinatura(user.id, patch);

  if (e) {
    try {
      await associarUserIdPorEmail(e, user.id);
    } catch (erroAssoc) {
      console.error("Webhook associar user_id:", erroAssoc.message || erroAssoc);
    }
  }

  return user;
}

async function emailsParaAdimplencia(userId, emailInformado) {
  const emails = new Set();
  const informado = String(emailInformado || "")
    .trim()
    .toLowerCase();
  if (informado) emails.add(informado);
  if (userId) {
    const conta = await buscarUsuarioPorId(userId);
    const daConta = String(conta?.email || "")
      .trim()
      .toLowerCase();
    if (daConta) emails.add(daConta);
  }
  return [...emails];
}

async function marcarAdimplenteNosEmails(emails) {
  for (const email of emails) {
    try {
      await marcarAdimplentePorEmail(email);
    } catch (erroPaginas) {
      console.error("Webhook reativar páginas:", erroPaginas.message || erroPaginas);
    }
  }
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

    if (evento === "CHECKOUT_PAID" && body.checkout) {
      const { plano: planoCheckout, userId } = planoDoCheckout(body.checkout);
      let emailCheckout = String(body.checkout.customerData?.email || "")
        .trim()
        .toLowerCase();
      const customerId = body.checkout.customer || null;
      if (!emailCheckout && customerId && process.env.ASAAS_API_KEY) {
        try {
          const cliente = await asaasFetch(`/customers/${encodeURIComponent(customerId)}`);
          emailCheckout = String(cliente?.email || "")
            .trim()
            .toLowerCase();
        } catch (erroCliente) {
          console.error("Webhook checkout cliente:", erroCliente.message || erroCliente);
        }
      }
      if (planoCheckout && (userId || emailCheckout)) {
        try {
          await sincronizarContaPorEmail(emailCheckout, {
            userId,
            planoId: planoCheckout.id,
            status: "ativa",
            customerId,
            paymentId: body.checkout.id || null
          });
        } catch (erroCheckout) {
          console.error("Webhook checkout:", erroCheckout.message || erroCheckout);
        }
        const emailsCheckout = await emailsParaAdimplencia(userId, emailCheckout);
        await marcarAdimplenteNosEmails(emailsCheckout);
      }
    }

    await registrarPagamentoEvento({
      event: evento,
      paymentId: pagamento?.id || body.checkout?.id || null,
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
          const refPagamento = lerReferenciaCheckout(pagamento.externalReference);
          const emailsPagamento = await emailsParaAdimplencia(refPagamento?.userId, email);
          await marcarAdimplenteNosEmails(emailsPagamento);
          try {
            await sincronizarContaPorEmail(email, {
              userId: refPagamento?.userId,
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
