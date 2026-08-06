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
const { getSupabase, supabaseConfigured } = require("../supabase");
const { situacaoDe } = require("../paginas");

async function briefingEnviado(userId, email) {
  if (!supabaseConfigured()) return false;
  const sb = getSupabase();
  let q = sb
    .from("mensagens")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "briefing");
  if (userId) {
    q = q.eq("user_id", userId);
  } else if (email) {
    q = q.eq("remetente_email", email);
  } else {
    return false;
  }
  const { count, error } = await q;
  if (error) {
    console.error("briefingEnviado:", error.message);
    return false;
  }
  return (count || 0) > 0;
}

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

    let paginaResumo = null;
    if (pagina) {
      const sit = situacaoDe({
        slug: pagina.slug,
        email_cobranca: pagina.email_cobranca,
        ativo: pagina.ativo !== false,
        inadimplente_desde: pagina.inadimplente_desde,
        controle_manual: pagina.controle_manual === true
      });
      const dados = pagina.dados && typeof pagina.dados === "object" ? pagina.dados : {};
      paginaResumo = {
        slug: pagina.slug,
        nome: dados.nome || dados.empresa || pagina.slug,
        publicado: pagina.publicado !== false,
        ativo: pagina.ativo !== false,
        email_cobranca: pagina.email_cobranca,
        situacao: sit.codigo,
        situacaoLabel: sit.label,
        catalogos: Array.isArray(dados.catalogos) ? dados.catalogos : [],
        marcas: Array.isArray(dados.marcas) ? dados.marcas : [],
        foto: dados.foto || null,
        url: `/${pagina.slug}/`
      };
    }

    const enviado = await briefingEnviado(user.id, email);

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
      pagina: paginaResumo,
      briefingEnviado: enviado
    });
  } catch (erro) {
    return json(res, erro.status || 500, { erro: erro.message || "Erro ao carregar perfil." });
  }
};
