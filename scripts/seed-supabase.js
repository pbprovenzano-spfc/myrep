/* =========================================================
   scripts/seed-supabase.js — JSONs locais → Supabase + Storage
   ========================================================= */

const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./load-env");
const { getSupabase, supabaseConfigured } = require("../api/_lib/supabase");
const { normalizarDados } = require("../api/_lib/dados");

const RAIZ = path.join(__dirname, "..");
const DIR_CLIENTES = path.join(RAIZ, "clientes");
const DIR_ASSETS = path.join(RAIZ, "assets-clientes");
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "assets-clientes";

function mimeDe(nome) {
  const ext = path.extname(nome).toLowerCase();
  const map = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".pdf": "application/pdf"
  };
  return map[ext] || "application/octet-stream";
}

async function uploadArquivo(sb, slug, nomeArquivo) {
  const local = path.join(DIR_ASSETS, slug, nomeArquivo);
  if (!fs.existsSync(local)) {
    console.warn(`  ⚠ asset ausente: ${slug}/${nomeArquivo}`);
    return false;
  }
  const remoto = `${slug}/${nomeArquivo}`;
  const body = fs.readFileSync(local);
  const { error } = await sb.storage.from(BUCKET).upload(remoto, body, {
    upsert: true,
    contentType: mimeDe(nomeArquivo)
  });
  if (error) {
    console.error(`  ✕ upload ${remoto}:`, error.message);
    return false;
  }
  return true;
}

function coletarAssets(dados) {
  const arquivos = new Set();
  if (dados.foto) arquivos.add(dados.foto);
  if (Array.isArray(dados.marcas)) {
    for (const m of dados.marcas) {
      if (m.logo) arquivos.add(m.logo);
    }
  }
  if (Array.isArray(dados.catalogos)) {
    for (const c of dados.catalogos) {
      if (c.arquivo) arquivos.add(c.arquivo);
      if (c.logo) arquivos.add(c.logo);
    }
  }
  return [...arquivos];
}

async function main() {
  loadEnv(RAIZ);
  if (!supabaseConfigured()) {
    console.error("\nConfigure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env\n");
    process.exit(1);
  }

  const sb = getSupabase();
  if (!fs.existsSync(DIR_CLIENTES)) {
    console.error("Pasta clientes/ não encontrada.");
    process.exit(1);
  }

  const jsons = fs.readdirSync(DIR_CLIENTES).filter((f) => f.endsWith(".json"));
  console.log(`\n▸ Seed Supabase — ${jsons.length} representante(s)\n`);

  for (const arquivo of jsons) {
    const caminho = path.join(DIR_CLIENTES, arquivo);
    let dados;
    try {
      dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
    } catch (e) {
      console.error(`  ✕ ${arquivo}: JSON inválido`);
      continue;
    }
    if (!dados.slug) {
      console.error(`  ✕ ${arquivo}: sem slug`);
      continue;
    }

    const normalizado = normalizarDados(dados);
    const assets = coletarAssets(normalizado);
    for (const a of assets) {
      await uploadArquivo(sb, dados.slug, a);
    }

    const pastaSlug = path.join(DIR_ASSETS, dados.slug);
    if (fs.existsSync(pastaSlug)) {
      for (const f of fs.readdirSync(pastaSlug)) {
        const full = path.join(pastaSlug, f);
        if (fs.statSync(full).isFile() && !assets.includes(f)) {
          await uploadArquivo(sb, dados.slug, f);
        }
      }
    }

    const { error } = await sb.from("representantes").upsert(
      {
        slug: normalizado.slug,
        dados: normalizado,
        publicado: true,
        publicado_em: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: "slug" }
    );

    if (error) {
      console.error(`  ✕ ${dados.slug}:`, error.message);
      continue;
    }
    console.log(`  ✓ ${dados.slug}`);
  }

  console.log("\n▸ Seed concluído.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
