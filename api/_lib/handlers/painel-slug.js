/* =========================================================
   GET/POST /api/painel/slug — reservar URL definitiva
   ========================================================= */

const { json, lerJsonBody } = require("../pagamento");
const { exigirUsuario } = require("../auth");
const { obterPaginaPorUserId, normalizarEmail } = require("../assinaturas");
const { getSupabase, supabaseConfigured } = require("../supabase");
const { slugValido } = require("../slugs");
const { exigirAssinaturaAtiva, paginaResumo } = require("../painel-helpers");

async function slugDisponivel(slug) {
  if (!supabaseConfigured()) return false;
  const sb = getSupabase();
  const { data } = await sb.from("representantes").select("slug").eq("slug", slug).maybeSingle();
  return !data;
}

module.exports = async function handler(req, res) {
  try {
    const { user } = await exigirUsuario(req);

    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const bruto = url.searchParams.get("slug") || "";
      const val = slugValido(bruto);
      if (!val.ok) {
        return json(res, 200, { ok: true, disponivel: false, slug: val.slug, motivo: val.motivo });
      }
      const livre = await slugDisponivel(val.slug);
      return json(res, 200, {
        ok: true,
        disponivel: livre,
        slug: val.slug,
        motivo: livre ? null : "Este endereço já está em uso.",
        url: livre ? `/${val.slug}/` : null
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, { erro: "Método não permitido" });
    }

    if (!supabaseConfigured()) {
      return json(res, 503, { erro: "Supabase não configurado." });
    }

    await exigirAssinaturaAtiva(user.id);

    const existente = await obterPaginaPorUserId(user.id);
    if (existente) {
      return json(res, 409, {
        erro: "Você já possui uma URL. Ela não pode ser alterada.",
        pagina: paginaResumo(existente)
      });
    }

    const body = await lerJsonBody(req);
    const val = slugValido(body.slug || "");
    if (!val.ok) {
      return json(res, 400, { erro: val.motivo || "Slug inválido." });
    }

    const livre = await slugDisponivel(val.slug);
    if (!livre) {
      return json(res, 409, { erro: "Este endereço já está em uso. Escolha outro." });
    }

    const email = normalizarEmail(user.email);
    const sb = getSupabase();
    const { data, error } = await sb
      .from("representantes")
      .insert({
        slug: val.slug,
        dados: {
          slug: val.slug,
          nome: user.user_metadata?.nome || user.user_metadata?.full_name || val.slug,
          paleta: "ambar"
        },
        publicado: false,
        ativo: true,
        user_id: user.id,
        email_cobranca: email || null
      })
      .select()
      .single();

    if (error) {
      console.error("painel slug insert:", error.message);
      if (error.code === "23505") {
        return json(res, 409, { erro: "Este endereço acabou de ser reservado. Escolha outro." });
      }
      return json(res, 500, { erro: "Falha ao reservar URL." });
    }

    return json(res, 201, {
      ok: true,
      pagina: paginaResumo(data),
      aviso: "URL reservada com sucesso. Ela não poderá ser alterada."
    });
  } catch (erro) {
    console.error("painel slug:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro interno." });
  }
};
