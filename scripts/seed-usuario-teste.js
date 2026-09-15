/* =========================================================
   scripts/seed-usuario-teste.js — conta local para conferir o /painel/
   Uso: npm run seed:usuario-teste
   ========================================================= */

const { loadEnv } = require("./load-env");
const { getSupabase, supabaseConfigured } = require("../api/_lib/supabase");
const {
  upsertAssinatura,
  obterPaginaPorUserId
} = require("../api/_lib/assinaturas");

const EMAIL = process.env.TEST_USER_EMAIL || "teste.painel@myrep.local";
const SENHA = process.env.TEST_USER_PASSWORD || "TestePainel123!";
const SLUG = process.env.TEST_USER_SLUG || "teste-painel";
const NOME = "Ana Teste";

async function buscarUsuarioPorEmail(sb, email) {
  const alvo = String(email).trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const users = data?.users || [];
    const achado = users.find((u) => String(u.email || "").toLowerCase() === alvo);
    if (achado) return achado;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function garantirUsuario(sb) {
  const existente = await buscarUsuarioPorEmail(sb, EMAIL);
  if (existente) {
    const { data, error } = await sb.auth.admin.updateUserById(existente.id, {
      password: SENHA,
      email_confirm: true,
      user_metadata: { ...(existente.user_metadata || {}), nome: NOME }
    });
    if (error) throw new Error(`updateUser: ${error.message}`);
    console.log(`  ✓ usuário atualizado (${EMAIL})`);
    return data.user || existente;
  }

  const { data, error } = await sb.auth.admin.createUser({
    email: EMAIL,
    password: SENHA,
    email_confirm: true,
    user_metadata: { nome: NOME }
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  console.log(`  ✓ usuário criado (${EMAIL})`);
  return data.user;
}

async function garantirPagina(sb, user) {
  const atual = await obterPaginaPorUserId(user.id);
  if (atual) {
    console.log(`  ✓ página já vinculada: /${atual.slug}/`);
    return atual;
  }

  const { data: slugRow, error: slugErr } = await sb
    .from("representantes")
    .select("id, slug, user_id")
    .eq("slug", SLUG)
    .maybeSingle();
  if (slugErr) throw new Error(`buscar slug: ${slugErr.message}`);

  if (slugRow) {
    if (slugRow.user_id && slugRow.user_id !== user.id) {
      throw new Error(`O endereço /${SLUG}/ já pertence a outra conta.`);
    }
    const { data, error } = await sb
      .from("representantes")
      .update({
        user_id: user.id,
        email_cobranca: EMAIL,
        updated_at: new Date().toISOString()
      })
      .eq("slug", SLUG)
      .select()
      .single();
    if (error) throw new Error(`vincular slug: ${error.message}`);
    console.log(`  ✓ slug existente vinculado: /${SLUG}/`);
    return data;
  }

  const { data, error } = await sb
    .from("representantes")
    .insert({
      slug: SLUG,
      dados: {
        slug: SLUG,
        nome: NOME,
        paleta: "ambar"
      },
      publicado: false,
      ativo: true,
      user_id: user.id,
      email_cobranca: EMAIL
    })
    .select()
    .single();
  if (error) throw new Error(`reservar slug: ${error.message}`);
  console.log(`  ✓ URL reservada: /${SLUG}/`);
  return data;
}

async function main() {
  loadEnv();
  if (!supabaseConfigured()) {
    console.error("Supabase não configurado. Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.");
    process.exit(1);
  }

  const sb = getSupabase();
  console.log("\n▸ Provisionando conta de teste do painel…\n");

  const user = await garantirUsuario(sb);
  const ass = await upsertAssinatura(user.id, {
    plano: "vitalicio",
    status: "ativa",
    proxima_cobranca: null
  });
  if (!ass) throw new Error("Falha ao gravar assinatura vitalícia.");
  console.log("  ✓ plano vitalício ativo");

  await garantirPagina(sb, user);

  console.log(`
▸ Pronto. Entre em http://localhost:3000/entrar/

  e-mail  ${EMAIL}
  senha   ${SENHA}

  Depois abra http://localhost:3000/painel/
`);
}

main().catch((erro) => {
  console.error(erro.message || erro);
  process.exit(1);
});
