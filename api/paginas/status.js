/* =========================================================
   GET /api/paginas/status?slug= — status público (ativo/inativo)
   ========================================================= */

const { json } = require("../_lib/pagamento");
const { paginaAtiva, normalizarSlug } = require("../_lib/paginas");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const url = new URL(req.url, "http://localhost");
    const slug = normalizarSlug(url.searchParams.get("slug") || "");
    if (!slug) return json(res, 400, { erro: "Informe slug." });

    const ativo = await paginaAtiva(slug);
    res.setHeader("Cache-Control", "no-store");
    return json(res, 200, { ok: true, slug, ativo });
  } catch (erro) {
    console.error("paginas/status:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro ao consultar status." });
  }
};
