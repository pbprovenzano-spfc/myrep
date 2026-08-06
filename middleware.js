/* =========================================================
   Vercel Edge Middleware — páginas inativas → 404
   ========================================================= */

const RESERVADOS = new Set([
  "api",
  "css",
  "js",
  "img",
  "admin",
  "briefing",
  "pagamento",
  "alteracoes",
  "termos",
  "representantes",
  "assinantes",
  "cadastro",
  "entrar",
  "recuperar-senha",
  "painel",
  "assets-clientes",
  "inbox",
  "favicon.ico",
  "404.html",
  "index.html"
]);

function primeiroSegmento(pathname) {
  const limpo = String(pathname || "/").split("?")[0];
  const partes = limpo.split("/").filter(Boolean);
  return partes[0] || "";
}

export const config = {
  matcher: ["/((?!api/|_next/|css/|js/|img/|assets-clientes/|favicon\\.ico|.*\\..*).*)"]
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const segmento = primeiroSegmento(url.pathname).toLowerCase();

  if (!segmento || RESERVADOS.has(segmento)) {
    return;
  }

  try {
    const statusUrl = new URL(
      `/api/paginas/status?slug=${encodeURIComponent(segmento)}`,
      url.origin
    );
    const resp = await fetch(statusUrl.toString(), {
      headers: { Accept: "application/json" }
    });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data && data.ativo === false) {
      const notFound = await fetch(new URL("/404.html", url.origin));
      const html = await notFound.text();
      return new Response(html, {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }
  } catch {
    /* se o status falhar, deixa servir a página */
  }
}
