/* =========================================================
   POST /api/painel/teste — começa o teste grátis de 14 dias
   O rep escolhe o plano e cadastra o cartão; nada é cobrado hoje.
   - Mensal: a recorrência já nasce na Asaas com a 1ª cobrança no fim do teste.
   - Anual: o cartão fica guardado (token da Asaas) e o cron cobra as 12× no fim do teste.
   O corpo desta requisição (cartão) nunca é registrado nem armazenado.
   ========================================================= */

const {
  PLANOS,
  json,
  lerJsonBody,
  asaasFetch,
  asaasPronta,
  dataIso,
  somarDias,
  referenciaCheckout
} = require("../pagamento");
const { exigirUsuario } = require("../auth");
const { getSupabase, supabaseConfigured } = require("../supabase");
const {
  obterAssinaturaPorUserId,
  upsertAssinatura,
  STATUS_COM_ACESSO,
  DIAS_TESTE
} = require("../assinaturas");
const {
  cobrancaDeUsuario,
  mesclarCobranca,
  lerCobranca,
  validarCobranca,
  metadataDeCobranca,
  garantirClienteAsaas,
  titularAsaasDeCobranca
} = require("../cobranca");
const { lerCartao, validarCartao, ipDoCliente } = require("../cartao");

function erroHttp(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

/** Um teste por pessoa: conta, CPF/CNPJ e histórico de assinatura. */
async function conferirDireitoAoTeste(userId, atual, documento) {
  if (atual) {
    if (STATUS_COM_ACESSO.includes(atual.status)) {
      throw erroHttp(409, "Você já tem acesso ao painel. Não é preciso começar um teste.");
    }
    if (atual.teste_ate || atual.status === "cancelada") {
      throw erroHttp(409, "O teste grátis é um por pessoa e já foi usado nesta conta. Escolha um plano para continuar.");
    }
  }
  const { data, error } = await getSupabase()
    .from("assinaturas")
    .select("user_id")
    .eq("documento_teste", documento)
    .neq("user_id", userId)
    .limit(1);
  if (error) {
    console.error("teste documento:", error.message);
    throw erroHttp(503, "Não foi possível começar o teste agora. Tente de novo em alguns minutos.");
  }
  if (data && data.length) {
    throw erroHttp(409, "Este CPF/CNPJ já usou o teste grátis. Escolha um plano para continuar.");
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  let recorrenciaCriada = null;
  try {
    const { user } = await exigirUsuario(req);
    if (!asaasPronta() || !supabaseConfigured()) {
      return json(res, 503, { erro: "Pagamento ainda não configurado." });
    }

    const body = await lerJsonBody(req);
    const plano = PLANOS[String(body.plano || "").trim()];
    if (!plano || !["mensal", "anual"].includes(plano.id)) {
      return json(res, 400, { erro: "Escolha o plano mensal ou o anual." });
    }

    const email = String(user.email || "").trim().toLowerCase();
    if (!email) return json(res, 400, { erro: "Conta sem e-mail." });

    const cobranca = mesclarCobranca(cobrancaDeUsuario(user), lerCobranca(body.cobranca || {}));
    const erroCobranca = validarCobranca(cobranca);
    if (erroCobranca) return json(res, 400, { erro: erroCobranca });

    const cartao = lerCartao(body.cartao || {});
    const erroCartao = validarCartao(cartao);
    if (erroCartao) return json(res, 400, { erro: erroCartao });

    const atual = await obterAssinaturaPorUserId(user.id);
    await conferirDireitoAoTeste(user.id, atual, cobranca.cpfCnpj);

    const customerId = await garantirClienteAsaas({
      customerId: atual?.asaas_customer_id || null,
      email,
      userId: user.id,
      cobranca
    });
    const ip = ipDoCliente(req);

    // A Asaas confere o cartão com o banco e devolve um token; o número não fica com a gente.
    let tokenizado;
    try {
      tokenizado = await asaasFetch("/creditCard/tokenizeCreditCard", {
        method: "POST",
        body: JSON.stringify({
          customer: customerId,
          creditCard: {
            holderName: cartao.titular,
            number: cartao.numero,
            expiryMonth: cartao.mes,
            expiryYear: cartao.ano,
            ccv: cartao.cvv
          },
          creditCardHolderInfo: titularAsaasDeCobranca(cobranca, { email }),
          ...(ip ? { remoteIp: ip } : {})
        })
      });
    } catch (erro) {
      const motivo = String(erro.message || "confira os dados").replace(/[.\s]+$/, "");
      throw erroHttp(400, `Cartão não aceito: ${motivo}.`);
    }
    const token = tokenizado?.creditCardToken;
    if (!token) throw erroHttp(502, "A Asaas não confirmou o cartão. Tente de novo.");

    const primeiraCobranca = somarDias(dataIso(), DIAS_TESTE);

    if (plano.id === "mensal") {
      const assinaturaAsaas = await asaasFetch("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          customer: customerId,
          billingType: "CREDIT_CARD",
          value: plano.valor,
          nextDueDate: primeiraCobranca,
          cycle: "MONTHLY",
          description: "My Rep — plano mensal",
          externalReference: referenciaCheckout(user.id, plano.id),
          creditCardToken: token,
          ...(ip ? { remoteIp: ip } : {})
        })
      });
      recorrenciaCriada = assinaturaAsaas?.id || null;
      if (!recorrenciaCriada) throw erroHttp(502, "A Asaas não criou a assinatura. Tente de novo.");
    }

    const salva = await upsertAssinatura(user.id, {
      plano: plano.id,
      status: "teste",
      asaas_customer_id: customerId,
      asaas_subscription_id: recorrenciaCriada,
      proxima_cobranca: primeiraCobranca,
      cancelamento_agendado: false,
      teste_ate: primeiraCobranca,
      // Só o anual precisa do token: no mensal quem cobra é a recorrência da Asaas.
      asaas_card_token: plano.id === "anual" ? token : null,
      cartao_bandeira: String(tokenizado.creditCardBrand || "").toUpperCase() || null,
      cartao_ultimos: String(tokenizado.creditCardNumber || cartao.numero).replace(/\D/g, "").slice(-4),
      documento_teste: cobranca.cpfCnpj
    });
    if (!salva) throw erroHttp(500, "Não foi possível salvar o teste. Nada foi cobrado; tente de novo.");
    recorrenciaCriada = null;

    try {
      await getSupabase().auth.admin.updateUserById(user.id, {
        user_metadata: { ...(user.user_metadata || {}), ...metadataDeCobranca(cobranca) }
      });
    } catch (erroMeta) {
      console.error("teste cobranca:", erroMeta.message || erroMeta);
    }

    return json(res, 200, {
      ok: true,
      plano: plano.id,
      testeAte: primeiraCobranca,
      cartao: { bandeira: salva.cartao_bandeira || "", ultimos: salva.cartao_ultimos || "" }
    });
  } catch (erro) {
    // Se a recorrência já existia na Asaas e o resto falhou, ela não pode ficar cobrando sozinha.
    if (recorrenciaCriada) {
      try {
        await asaasFetch(`/subscriptions/${encodeURIComponent(recorrenciaCriada)}`, { method: "DELETE" });
      } catch (erroDesfazer) {
        console.error("teste desfazer recorrência:", erroDesfazer.message || erroDesfazer);
      }
    }
    console.error("painel teste:", erro.message || "falha ao começar o teste");
    return json(res, erro.status || 500, { erro: erro.message || "Erro ao começar o teste." });
  }
};
