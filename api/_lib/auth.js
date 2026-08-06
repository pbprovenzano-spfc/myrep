/* =========================================================
   Sessão Supabase Auth — Bearer / cookie sb-access-token
   ========================================================= */

const { createClient } = require("@supabase/supabase-js");
const { getSupabase, supabaseConfigured } = require("./supabase");

function anonConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function getSupabaseAnon() {
  if (!anonConfigured()) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function cookieValor(req, nome) {
  const raw = req.headers.cookie || "";
  const partes = raw.split(";").map((p) => p.trim());
  for (const p of partes) {
    const i = p.indexOf("=");
    if (i < 1) continue;
    if (p.slice(0, i) === nome) {
      try {
        return decodeURIComponent(p.slice(i + 1));
      } catch {
        return p.slice(i + 1);
      }
    }
  }
  return "";
}

function extrairAccessToken(req) {
  const auth = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m) return m[1].trim();

  const headerToken = req.headers["x-supabase-access-token"];
  if (headerToken) return String(headerToken).trim();

  const direto = cookieValor(req, "sb-access-token");
  if (direto) return direto;

  // Cookie padrão do supabase-js (sb-<ref>-auth-token) às vezes vem como JSON
  const raw = req.headers.cookie || "";
  const match = /sb-[^=]+-auth-token=([^;]+)/.exec(raw);
  if (match) {
    try {
      const decoded = decodeURIComponent(match[1]);
      const parsed = JSON.parse(decoded);
      if (parsed?.access_token) return parsed.access_token;
      if (Array.isArray(parsed) && parsed[0]) return parsed[0];
    } catch {
      /* ignore */
    }
  }

  return "";
}

/**
 * @returns {Promise<{ user: object, accessToken: string }>}
 */
async function exigirUsuario(req) {
  if (!supabaseConfigured() && !anonConfigured()) {
    const erro = new Error("Supabase Auth não configurado.");
    erro.status = 503;
    throw erro;
  }

  const accessToken = extrairAccessToken(req);
  if (!accessToken) {
    const erro = new Error("Faça login para continuar.");
    erro.status = 401;
    throw erro;
  }

  // Prefer service role getUser(jwt) quando disponível
  if (supabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.getUser(accessToken);
    if (error || !data?.user) {
      const erro = new Error("Sessão inválida ou expirada.");
      erro.status = 401;
      throw erro;
    }
    return { user: data.user, accessToken };
  }

  const anon = getSupabaseAnon();
  const { data, error } = await anon.auth.getUser(accessToken);
  if (error || !data?.user) {
    const erro = new Error("Sessão inválida ou expirada.");
    erro.status = 401;
    throw erro;
  }
  return { user: data.user, accessToken };
}

async function buscarUsuarioPorEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e || !supabaseConfigured()) return null;

  // GoTrue admin: filtro por e-mail (mais preciso que listar páginas)
  try {
    const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resp = await fetch(
      `${base}/auth/v1/admin/users?page=1&per_page=50&email=${encodeURIComponent(e)}`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key
        }
      }
    );
    if (resp.ok) {
      const body = await resp.json();
      const lista = body.users || body || [];
      const arr = Array.isArray(lista) ? lista : [];
      const hit = arr.find((u) => String(u.email || "").toLowerCase() === e);
      if (hit) return hit;
    }
  } catch (erroFetch) {
    console.error("buscarUsuarioPorEmail fetch:", erroFetch.message || erroFetch);
  }

  try {
    const sb = getSupabase();
    let page = 1;
    while (page <= 5) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        console.error("buscarUsuarioPorEmail:", error.message);
        return null;
      }
      const lista = data?.users || [];
      const hit = lista.find((u) => String(u.email || "").toLowerCase() === e);
      if (hit) return hit;
      if (lista.length < 200) break;
      page += 1;
    }
    return null;
  } catch (erro) {
    console.error("buscarUsuarioPorEmail:", erro.message || erro);
    return null;
  }
}

async function listarUsuariosAuth({ page = 1, perPage = 50 } = {}) {
  if (!supabaseConfigured()) return { users: [], total: 0 };
  const sb = getSupabase();
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
  if (error) {
    console.error("listarUsuariosAuth:", error.message);
    return { users: [], total: 0 };
  }
  return {
    users: data?.users || [],
    total: data?.total ?? (data?.users || []).length
  };
}

module.exports = {
  anonConfigured,
  getSupabaseAnon,
  extrairAccessToken,
  exigirUsuario,
  buscarUsuarioPorEmail,
  listarUsuariosAuth,
  cookieValor
};
