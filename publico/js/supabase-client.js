/* =========================================================
   Cliente Supabase no browser (usa window.MYREP_SUPABASE)
   ========================================================= */

(function (global) {
  function cfg() {
    return global.MYREP_SUPABASE || {};
  }

  function pronto() {
    const c = cfg();
    return !!(c.url && c.anonKey && global.supabase && global.supabase.createClient);
  }

  let cliente = null;

  function getClient() {
    if (cliente) return cliente;
    if (!pronto()) return null;
    const c = cfg();
    cliente = global.supabase.createClient(c.url, c.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: global.localStorage
      }
    });
    return cliente;
  }

  async function sessaoAtual() {
    const sb = getClient();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  }

  async function accessToken() {
    const s = await sessaoAtual();
    return s?.access_token || "";
  }

  async function headersAuth(json) {
    const h = {};
    if (json) h["Content-Type"] = "application/json";
    const token = await accessToken();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  async function apiPerfil() {
    const resp = await fetch("/api/auth/perfil", {
      headers: await headersAuth(false),
      credentials: "same-origin"
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data.erro || "Não autenticado");
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  global.MyRepAuth = {
    pronto,
    getClient,
    sessaoAtual,
    accessToken,
    headersAuth,
    apiPerfil
  };
})(typeof window !== "undefined" ? window : globalThis);
