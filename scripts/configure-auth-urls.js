/* =========================================================
   Atualiza Site URL e Redirect URLs do Supabase Auth
   Uso: node scripts/configure-auth-urls.js
   Requer: SUPABASE_URL + SUPABASE_ACCESS_TOKEN no .env
   ========================================================= */

const path = require("path");
const { loadEnv } = require("./load-env");

loadEnv(path.join(__dirname, ".."));

const REF = (process.env.SUPABASE_URL || "").match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";

const SITE_URL = "https://myrep.com.br";
const REDIRECT_URLS = [
  "https://myrep.com.br/painel/",
  "https://www.myrep.com.br/painel/",
  "https://myrep.com.br/recuperar-senha/",
  "https://www.myrep.com.br/recuperar-senha/",
  "http://localhost:3000/painel/",
  "http://localhost:3000/recuperar-senha/"
];

async function main() {
  if (!REF) {
    console.error("SUPABASE_URL inválida ou ausente.");
    process.exit(1);
  }
  if (!TOKEN) {
    console.error("SUPABASE_ACCESS_TOKEN ausente no .env.");
    process.exit(1);
  }

  const base = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json"
  };

  const getResp = await fetch(base, { headers });
  const current = await getResp.json().catch(() => ({}));
  if (!getResp.ok) {
    console.error("GET auth config falhou:", getResp.status, current.message || current);
    process.exit(1);
  }

  console.log("Antes:");
  console.log("  site_url:", current.site_url);
  console.log("  uri_allow_list:", current.uri_allow_list || current.additional_redirect_urls);

  const patch = {
    site_url: SITE_URL,
    uri_allow_list: REDIRECT_URLS.join(",")
  };

  const patchResp = await fetch(base, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch)
  });
  const result = await patchResp.json().catch(() => ({}));
  if (!patchResp.ok) {
    console.error("PATCH auth config falhou:", patchResp.status, result.message || result);
    process.exit(1);
  }

  console.log("\nDepois:");
  console.log("  site_url:", result.site_url);
  console.log("  uri_allow_list:", result.uri_allow_list || result.additional_redirect_urls);
  console.log("\nAuth URLs configuradas. Peça um novo e-mail de confirmação no painel Supabase.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
