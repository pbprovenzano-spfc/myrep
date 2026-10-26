/* =========================================================
   Teste grátis — tarefas diárias (chamadas pelo cron de lembretes)
   - 2 dias antes do fim: e-mail avisando a data e o valor da 1ª cobrança
   - Fim do teste no anual: cria a cobrança 12× com o cartão guardado
   - Teste cancelado: tira a página do ar depois do último dia
   - Mensal sem confirmação 3 dias depois da data: marca inadimplente
   ========================================================= */

const { getSupabase, supabaseConfigured } = require("./supabase");
const { PLANOS, asaasFetch, asaasPronta, dataIso, somarDias, referenciaCheckout } = require("./pagamento");
const { upsertAssinatura, expirarSeVencido } = require("./assinaturas");
const { marcarInadimplentePorEmail } = require("./paginas");
const { chavesComEventos, registrarPagamentoEvento } = require("./acessos");
const {
  EVENTO_EMAIL_FIM_TESTE,
  EVENTO_EMAIL_COBRANCA_RECUSADA,
  emailFimTeste,
  emailCobrancaRecusada,
  enviarEmail,
  registrarFalha
} = require("./emails");

const EVENTO_COBRANCA_FIM_TESTE = "COBRANCA_FIM_TESTE_CRIADA";
const DIAS_AVISO = 2;
const DIAS_TOLERANCIA_MENSAL = 3;

function nomeDe(usuario) {
  const meta = usuario?.user_metadata || {};
  return meta.nome || meta.name || meta.full_name || "";
}

async function listarTestes() {
  if (!supabaseConfigured()) return [];
  const { data, error } = await getSupabase().from("assinaturas").select("*").eq("status", "teste").limit(5000);
  if (error) throw error;
  return data || [];
}

/** Cobra o anual no fim do teste com o token do cartão. Devolve true se a cobrança foi criada. */
async function cobrarAnual(ass) {
  const plano = PLANOS.anual;
  const pagamento = await asaasFetch("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: ass.asaas_customer_id,
      billingType: "CREDIT_CARD",
      dueDate: dataIso(),
      installmentCount: plano.parcelas,
      totalValue: plano.total,
      description: "My Rep — plano anual (12× sem juros)",
      externalReference: referenciaCheckout(ass.user_id, plano.id),
      creditCardToken: ass.asaas_card_token
    })
  });
  // Registra antes de limpar o token: se o update falhar, o evento impede cobrar de novo amanhã.
  await registrarPagamentoEvento({
    event: EVENTO_COBRANCA_FIM_TESTE,
    paymentId: ass.user_id,
    payload: { pagamento: pagamento?.id || null, plano: plano.id }
  });
  await upsertAssinatura(ass.user_id, {
    asaas_payment_id: pagamento?.id || null,
    asaas_card_token: null
  });
  return true;
}

async function marcarInadimplente(ass, usuario) {
  await upsertAssinatura(ass.user_id, { status: "inadimplente", asaas_card_token: null });
  if (usuario?.email) await marcarInadimplentePorEmail(usuario.email);
}

/**
 * @param {{ usuariosPorId: Map<string, object>, hoje?: string }} opcoes
 */
async function processarTestes({ usuariosPorId, hoje = dataIso() }) {
  const resultado = { avisos: 0, cobrancas: 0, recusadas: 0, expirados: 0, inadimplentes: 0, falhas: 0 };
  const testes = await listarTestes();
  if (!testes.length) return resultado;

  const ids = testes.map((t) => t.user_id);
  const jaFeito = await chavesComEventos(
    [EVENTO_EMAIL_FIM_TESTE, EVENTO_COBRANCA_FIM_TESTE, EVENTO_EMAIL_COBRANCA_RECUSADA],
    ids
  );

  for (const ass of testes) {
    const usuario = usuariosPorId.get(ass.user_id) || null;
    const fim = String(ass.teste_ate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fim)) continue;

    try {
      if (ass.cancelamento_agendado === true) {
        const depois = await expirarSeVencido(ass, hoje);
        if (depois?.status === "cancelada") resultado.expirados += 1;
        continue;
      }

      const faltam = Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);

      if (faltam >= 1 && faltam <= DIAS_AVISO && usuario?.email && !jaFeito.get(EVENTO_EMAIL_FIM_TESTE).has(ass.user_id)) {
        const envio = await enviarEmail({
          para: usuario.email,
          ...emailFimTeste({ nome: nomeDe(usuario), plano: ass.plano, data: fim })
        });
        if (envio.ok) {
          resultado.avisos += 1;
          await registrarPagamentoEvento({ event: EVENTO_EMAIL_FIM_TESTE, paymentId: ass.user_id, payload: { email: usuario.email } });
        } else {
          resultado.falhas += 1;
        }
      }

      if (faltam > 0) continue;

      if (ass.plano === "anual") {
        if (jaFeito.get(EVENTO_COBRANCA_FIM_TESTE).has(ass.user_id) || !ass.asaas_card_token) continue;
        if (!asaasPronta()) continue;
        try {
          await cobrarAnual(ass);
          resultado.cobrancas += 1;
        } catch (erroCobranca) {
          // Cartão recusado (ou outro erro da Asaas): avisa o rep e entra na carência de inadimplência.
          resultado.recusadas += 1;
          await registrarFalha("Teste grátis: cobrança do anual", erroCobranca, { userId: ass.user_id });
          await marcarInadimplente(ass, usuario);
          if (usuario?.email && !jaFeito.get(EVENTO_EMAIL_COBRANCA_RECUSADA).has(ass.user_id)) {
            const envio = await enviarEmail({ para: usuario.email, ...emailCobrancaRecusada({ nome: nomeDe(usuario) }) });
            if (envio.ok) {
              await registrarPagamentoEvento({
                event: EVENTO_EMAIL_COBRANCA_RECUSADA,
                paymentId: ass.user_id,
                payload: { email: usuario.email }
              });
            }
          }
        }
        continue;
      }

      // Mensal: quem cobra é a Asaas e o webhook troca para "ativa". Sem confirmação depois da
      // tolerância (cartão recusado ou webhook perdido), entra na carência de inadimplência.
      if (hoje > somarDias(fim, DIAS_TOLERANCIA_MENSAL)) {
        await marcarInadimplente(ass, usuario);
        resultado.inadimplentes += 1;
      }
    } catch (erro) {
      resultado.falhas += 1;
      await registrarFalha("Teste grátis: tarefa diária", erro, { userId: ass.user_id });
    }
  }
  return resultado;
}

module.exports = { processarTestes, EVENTO_COBRANCA_FIM_TESTE };
