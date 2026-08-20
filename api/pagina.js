/* =========================================================
   GET /api/pagina?slug= — renderização runtime da página do representante
   ========================================================= */

const { RESERVADOS, normalizarSlug } = require("./_lib/slugs");
const { getSupabase, supabaseConfigured } = require("./_lib/supabase");
const { paginaAtiva } = require("./_lib/paginas");
const { gerarPagina, gerar404, lerTemplatePagina, setAssetsModo } = require("./_lib/render/pagina");
const { normalizarDados } = require("./_lib/dados");

let _tplCache = null;

function lerTemplate() {
  if (_tplCache) return _tplCache;
  _tplCache = lerTemplatePagina();
  return _tplCache;
}

function enviarHtml(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=0, must-revalidate");
  res.end(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ erro: "Método não permitido" }));
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const slug = normalizarSlug(url.searchParams.get("slug") || "");

  if (!slug || RESERVADOS.has(slug)) {
    return enviarHtml(res, 404, gerar404());
  }

  if (!supabaseConfigured()) {
    return enviarHtml(res, 503, gerar404());
  }

  try {
    const ativo = await paginaAtiva(slug);
    if (!ativo) {
      return enviarHtml(res, 404, gerar404());
    }

    const sb = getSupabase();
    const { data, error } = await sb
      .from("representantes")
      .select("slug, dados, publicado, ativo")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("pagina render:", error.message);
      return enviarHtml(res, 500, gerar404());
    }

    if (!data || data.publicado === false || data.ativo === false) {
      return enviarHtml(res, 404, gerar404());
    }

    const dados = normalizarDados({ ...(data.dados || {}), slug: data.slug });
    if (!dados.nome && !dados.empresa) {
      return enviarHtml(res, 404, gerar404());
    }

    setAssetsModo("storage");
    const tpl = lerTemplate();
    const htmlOut = gerarPagina(dados, tpl);

    if (req.method === "HEAD") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=0, must-revalidate");
      return res.end();
    }

    return enviarHtml(res, 200, htmlOut);
  } catch (erro) {
    console.error("pagina handler:", erro);
    return enviarHtml(res, 500, gerar404());
  }
};
