/* =========================================================
   PUT /api/painel/cobranca — dados de cobrança do cliente
   ========================================================= */

const { json, lerJsonBody, asaasPronta } = require("../pagamento");
const { getSupabase, supabaseConfigured } = require("../supabase");
const { exigirUsuario } = require("../auth");
const { obterAssinaturaPorUserId, upsertAssinatura } = require("../assinaturas");
const {
  cobrancaDeUsuario,
  mesclarCobranca,
  lerCobranca,
  validarCobranca,
  metadataDeCobranca,
  respostaCobranca,
  garantirClienteAsaas
} = require("../cobranca");

module.exports = async function handler(req, res) {
  if (req.method !== "PUT" && req.method !== "POST") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const { user } = await exigirUsuario(req);
    if (!supabaseConfigured()) {
      return json(res, 503, { erro: "Supabase não configurado." });
    }

    const email = String(user.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      return json(res, 400, { erro: "Conta sem e-mail." });
    }

    const body = await lerJsonBody(req);
    const cobranca = mesclarCobranca(cobrancaDeUsuario(user), lerCobranca(body.cobranca || body));
    const erroCobranca = validarCobranca(cobranca);
    if (erroCobranca) {
      return json(res, 400, { erro: erroCobranca });
    }

    const { error } = await getSupabase().auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata || {}), ...metadataDeCobranca(cobranca) }
    });
    if (error) {
      console.error("painel cobranca metadata:", error.message);
      return json(res, 500, { erro: "Falha ao salvar os dados de cobrança." });
    }

    const assinatura = await obterAssinaturaPorUserId(user.id);
    let aviso = "Dados de cobrança salvos.";
    if (asaasPronta() && assinatura) {
      try {
        const customerId = await garantirClienteAsaas({
          customerId: assinatura.asaas_customer_id,
          email,
          userId: user.id,
          cobranca
        });
        if (customerId && customerId !== assinatura.asaas_customer_id) {
          await upsertAssinatura(user.id, { asaas_customer_id: customerId });
        }
      } catch (erroAsaas) {
        console.error("painel cobranca asaas:", erroAsaas.message || erroAsaas);
        aviso = "Dados salvos aqui, mas a Asaas não aceitou a atualização. Tente de novo mais tarde.";
      }
    }

    return json(res, 200, {
      ok: true,
      cobranca: respostaCobranca(cobranca),
      aviso
    });
  } catch (erro) {
    console.error("painel cobranca:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro ao salvar cobrança." });
  }
};
