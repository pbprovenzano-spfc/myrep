/* =========================================================
   Aplica migration-self-service.sql via Supabase Management API
   Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/apply-self-service-migration.js
   ========================================================= */

const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./load-env");

loadEnv(path.join(__dirname, ".."));

const REF = (process.env.SUPABASE_URL || "").match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const SQL_PATH = path.join(__dirname, "..", "supabase", "migration-self-service.sql");

async function viaManagementApi(query) {
  const token = ACCESS_TOKEN;
  if (!token) return { ok: false, status: 0, body: { message: "SUPABASE_ACCESS_TOKEN não definido" } };

  const resp = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });
  const text = await resp.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, body };
}

async function verificarTabelas() {
  const { createClient } = require("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const checks = [];
  for (const t of ["representantes", "mensagens", "mensagens_respostas"]) {
    const { error } = await sb.from(t).select("*").limit(0);
    checks.push({ tabela: t, ok: !error, erro: error?.message || null });
  }

  const { data: cols } = await sb.from("representantes").select("publicado_em").limit(1);
  checks.push({
    tabela: "representantes.publicado_em",
    ok: cols !== null,
    erro: null
  });

  return checks;
}

async function main() {
  if (!REF || !KEY) {
    console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!fs.existsSync(SQL_PATH)) {
    console.error("Arquivo não encontrado:", SQL_PATH);
    process.exit(1);
  }

  const sql = fs.readFileSync(SQL_PATH, "utf8");
  console.log(`\n▸ Projeto: ${REF}`);
  console.log("▸ Aplicando migration-self-service.sql…\n");

  const result = await viaManagementApi(sql);
  if (result.ok) {
    console.log("  ✓ Migração aplicada via Management API");
  } else {
    if (result.status) {
      console.log(`  Management API (${result.status}):`, JSON.stringify(result.body).slice(0, 400));
    }
    console.log("\n▸ Tentando executar via SQL direto (pooler)…");

    // Fallback: postgres via pooler — requer SUPABASE_DB_PASSWORD
    const dbPass = process.env.SUPABASE_DB_PASSWORD;
    if (!dbPass) {
      console.error(
        "\n  Não foi possível aplicar DDL automaticamente.\n" +
          "  A chave sb_secret_... (service role) não executa SQL de schema.\n" +
          "  Opções:\n" +
          "  1) Cole supabase/migration-self-service.sql no SQL Editor do Dashboard\n" +
          "  2) Defina SUPABASE_ACCESS_TOKEN (Account → Access Tokens) e rode de novo\n" +
          "  3) Defina SUPABASE_DB_PASSWORD (Settings → Database) e rode de novo\n"
      );
      process.exit(1);
    }

    let pg;
    try {
      pg = require("pg");
    } catch {
      console.error("  Instale pg: npm install pg");
      process.exit(1);
    }

    const host = process.env.SUPABASE_DB_HOST || `aws-0-sa-east-1.pooler.supabase.com`;
    const port = Number(process.env.SUPABASE_DB_PORT || 6543);
    const user = process.env.SUPABASE_DB_USER || `postgres.${REF}`;
    const client = new pg.Client({
      host,
      port,
      user,
      password: dbPass,
      database: "postgres",
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log("  ✓ Migração aplicada via Postgres");
  }

  console.log("\n▸ Verificando tabelas…");
  const checks = await verificarTabelas();
  for (const c of checks) {
    console.log(`  ${c.ok ? "✓" : "✕"} ${c.tabela}${c.erro ? " — " + c.erro : ""}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
