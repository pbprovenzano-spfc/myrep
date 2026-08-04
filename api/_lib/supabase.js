const { createClient } = require("@supabase/supabase-js");

function supabaseConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
  if (!supabaseConfigured()) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function storagePublicUrl(slug, arquivo) {
  if (!arquivo || !slug) return "";
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "assets-clientes";
  const nome = String(arquivo).split("/").pop();
  return `${base}/storage/v1/object/public/${bucket}/${slug}/${encodeURIComponent(nome)}`;
}

module.exports = { getSupabase, supabaseConfigured, storagePublicUrl };
