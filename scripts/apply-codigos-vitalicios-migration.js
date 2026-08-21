/* =========================================================
   Aplica migration-codigos-vitalicios.sql via Supabase Management API
   Uso: node scripts/apply-codigos-vitalicios-migration.js
   ========================================================= */

const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./load-env");

loadEnv(path.join(__dirname, ".."));

const REF = (process.env.SUPABASE_URL || "").match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const SQL_PATH = path.join(__dirname, "..", "supabase", "migration-codigos-vitalicios.sql");

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

async function verificarTabela() {
  const { createClient } = require("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { error } = await sb.from("codigos_vitalicios").select("id, codigo").limit(0);
  return { ok: !error, erro: error?.message || null };
}

async function main() {
  if (!REF || !KEY) {
    console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
    process.exit(1);
  }
  if (!fs.existsSync(SQL_PATH)) {
    console.error("Arquivo não encontrado:", SQL_PATH);
    process.exit(1);
  }

  const sql = fs.readFileSync(SQL_PATH, "utf8");
  console.log(`\n▸ Projeto: ${REF}`);
  console.log("▸ Aplicando migration-codigos-vitalicios.sql…\n");

  const result = await viaManagementApi(sql);
  if (result.ok) {
    console.log("  ✓ Migração aplicada via Management API");
  } else {
    if (result.status) {
      console.log(`  Management API (${result.status}):`, JSON.stringify(result.body).slice(0, 400));
    }
    console.log("\n▸ Tentando executar via Postgres (pooler)…");

    const dbPass = process.env.SUPABASE_DB_PASSWORD;
    if (!dbPass) {
      console.error(
        "\n  Não foi possível aplicar DDL automaticamente.\n" +
          "  Opções:\n" +
          "  1) Cole supabase/migration-codigos-vitalicios.sql no SQL Editor do Dashboard\n" +
          "  2) Defina SUPABASE_ACCESS_TOKEN e rode de novo\n" +
          "  3) Defina SUPABASE_DB_PASSWORD e rode de novo\n"
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

    const host = process.env.SUPABASE_DB_HOST || "aws-0-sa-east-1.pooler.supabase.com";
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

  console.log("\n▸ Verificando tabela codigos_vitalicios…");
  const check = await verificarTabela();
  console.log(`  ${check.ok ? "✓" : "✕"} codigos_vitalicios${check.erro ? " — " + check.erro : ""}\n`);
  if (!check.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
