/* =========================================================
   POST /api/auth/logout — revoga sessão Supabase
   ========================================================= */

const { json } = require("../_lib/pagamento");
const { extrairAccessToken, getSupabaseAnon } = require("../_lib/auth");
const { getSupabase, supabaseConfigured } = require("../_lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const accessToken = extrairAccessToken(req);
    if (accessToken && supabaseConfigured()) {
      try {
        const sb = getSupabase();
        await sb.auth.admin.signOut(accessToken);
      } catch (erro) {
        console.error("logout admin.signOut:", erro.message || erro);
      }
    } else if (accessToken) {
      const anon = getSupabaseAnon();
      if (anon) {
        try {
          await anon.auth.signOut();
        } catch {
          /* ignore */
        }
      }
    }

    const secure = process.env.VERCEL ? "; Secure" : "";
    res.setHeader("Set-Cookie", [
      `sb-access-token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
      `sb-refresh-token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
    ]);

    return json(res, 200, { ok: true });
  } catch (erro) {
    return json(res, 200, { ok: true, aviso: erro.message });
  }
};
