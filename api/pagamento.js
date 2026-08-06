/* =========================================================
   /api/pagamento — liberar + validar (legado)
   Rewrites: /api/pagamento/liberar → ?acao=liberar
             /api/pagamento/validar → ?acao=validar
   ========================================================= */

const { json } = require("./_lib/pagamento");

function acaoDe(req) {
  const url = new URL(req.url, "http://localhost");
  const q = url.searchParams.get("acao");
  if (q) return String(q).trim().toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/liberar")) return "liberar";
  if (path.endsWith("/validar")) return "validar";
  return "";
}

module.exports = async function handler(req, res) {
  const acao = acaoDe(req);
  if (acao === "liberar") {
    return require("./_lib/handlers/pagamento-liberar")(req, res);
  }
  if (acao === "validar") {
    return require("./_lib/handlers/pagamento-validar")(req, res);
  }
  return json(res, 400, { erro: "Ação inválida. Use liberar ou validar." });
};
