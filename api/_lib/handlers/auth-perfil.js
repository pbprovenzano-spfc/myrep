/* =========================================================
   GET /api/auth/perfil — dados do cliente logado
   ========================================================= */

const { json } = require("../pagamento");
const { exigirUsuario } = require("../auth");
const {
  obterAssinaturaPorUserId,
  obterPaginaPorUserId,
  obterPaginaPorEmail
} = require("../assinaturas");
const { situacaoDe } = require("../paginas");
const { paginaResumo } = require("../painel-helpers");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const { user } = await exigirUsuario(req);
    const email = String(user.email || "")
      .trim()
      .toLowerCase();

    let assinatura = await obterAssinaturaPorUserId(user.id);
    let pagina = await obterPaginaPorUserId(user.id);
    if (!pagina && email) {
      pagina = await obterPaginaPorEmail(email);
    }

    let paginaOut = null;
    if (pagina) {
      const sit = situacaoDe({
        slug: pagina.slug,
        email_cobranca: pagina.email_cobranca,
        ativo: pagina.ativo !== false,
        inadimplente_desde: pagina.inadimplente_desde,
        controle_manual: pagina.controle_manual === true
      });
      paginaOut = {
        ...paginaResumo(pagina),
        situacao: sit.codigo,
        situacaoLabel: sit.label
      };
    }

    return json(res, 200, {
      ok: true,
      user: {
        id: user.id,
        email,
        nome: user.user_metadata?.nome || user.user_metadata?.full_name || null,
        emailConfirmado: !!user.email_confirmed_at || !!user.confirmed_at
      },
      assinatura: assinatura
        ? {
            plano: assinatura.plano,
            status: assinatura.status,
            proxima_cobranca: assinatura.proxima_cobranca,
            asaas_customer_id: assinatura.asaas_customer_id,
            asaas_subscription_id: assinatura.asaas_subscription_id
          }
        : null,
      pagina: paginaOut
    });
  } catch (erro) {
    return json(res, erro.status || 500, { erro: erro.message || "Erro ao carregar perfil." });
  }
};
