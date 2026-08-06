/* =========================================================
   /api/auth — perfil (GET) + logout (POST)
   Rewrites: /api/auth/perfil → ?acao=perfil
             /api/auth/logout → ?acao=logout
   ========================================================= */

const { json } = require("./_lib/pagamento");

function acaoDe(req) {
  const url = new URL(req.url, "http://localhost");
  const q = url.searchParams.get("acao");
  if (q) return String(q).trim().toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/perfil") || path.endsWith("/auth/perfil")) return "perfil";
  if (path.endsWith("/logout") || path.endsWith("/auth/logout")) return "logout";
  if (req.method === "GET") return "perfil";
  if (req.method === "POST") return "logout";
  return "";
}

module.exports = async function handler(req, res) {
  const acao = acaoDe(req);
  if (acao === "perfil") {
    return require("./_lib/handlers/auth-perfil")(req, res);
  }
  if (acao === "logout") {
    return require("./_lib/handlers/auth-logout")(req, res);
  }
  return json(res, 400, { erro: "Ação inválida. Use perfil ou logout." });
};
