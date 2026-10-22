/* =========================================================
   GET /sitemap.xml → /api/sitemap — páginas fixas + páginas publicadas
   dos reps (e de suas marcas) que não desmarcaram "Aparecer no Google".
   ========================================================= */

const { getSupabase, supabaseConfigured } = require("./_lib/supabase");
const { normalizarDados } = require("./_lib/dados");

const SITE = "https://www.myrep.com.br";
const FIXAS = ["/", "/termos/"];

function escXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function urlXml(caminho, lastmod) {
  const data = lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : "";
  return `  <url><loc>${escXml(SITE + caminho)}</loc>${data}</url>`;
}

async function paginasIndexaveis() {
  if (!supabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from("representantes")
    .select("slug, dados, updated_at")
    .eq("publicado", true)
    .eq("ativo", true)
    .limit(5000);
  if (error) throw error;
  return (data || []).filter((p) => p.slug && p.dados?.indexar !== false && !p.slug.startsWith("exemplo"));
}

module.exports = async function handler(req, res) {
  const linhas = FIXAS.map((c) => urlXml(c));
  try {
    for (const p of await paginasIndexaveis()) {
      linhas.push(urlXml(`/${p.slug}/`, p.updated_at));
      for (const marca of normalizarDados(p.dados).marcas) {
        linhas.push(urlXml(`/${p.slug}/${marca.slug}/`, p.updated_at));
      }
    }
  } catch (erro) {
    console.error("sitemap:", erro.message || erro);
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.end(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${linhas.join("\n")}\n</urlset>\n`
  );
};
