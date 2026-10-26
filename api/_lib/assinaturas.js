/* =========================================================
   Assinaturas locais (espelho do Asaas por user_id)
   ========================================================= */

const { getSupabase, supabaseConfigured } = require("./supabase");
const { dataIso } = require("./pagamento");

const STATUS_OK = new Set(["ativa", "inadimplente", "cancelada", "pendente", "teste"]);
/** Status que liberam o painel e a página. */
const STATUS_COM_ACESSO = ["ativa", "inadimplente", "teste"];
const DIAS_TESTE = 14;
// Colunas do teste grátis: só vão no update quando informadas, para não quebrar
// bancos em que a migration-teste-gratis.sql ainda não rodou.
const CAMPOS_TESTE = ["teste_ate", "asaas_card_token", "cartao_bandeira", "cartao_ultimos", "documento_teste"];

function normalizarEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  return e.includes("@") ? e.slice(0, 160) : "";
}

async function obterAssinaturaPorUserId(userId) {
  if (!userId || !supabaseConfigured()) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("assinaturas")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("obterAssinaturaPorUserId:", error.message);
    return null;
  }
  return data;
}

async function upsertAssinatura(userId, patch = {}) {
  if (!userId || !supabaseConfigured()) return null;
  const sb = getSupabase();
  const atual = await obterAssinaturaPorUserId(userId);
  const agora = new Date().toISOString();

  const registro = {
    user_id: userId,
    plano: patch.plano || atual?.plano || "mensal",
    status: STATUS_OK.has(patch.status) ? patch.status : atual?.status || "pendente",
    asaas_customer_id:
      patch.asaas_customer_id !== undefined
        ? patch.asaas_customer_id
        : atual?.asaas_customer_id || null,
    asaas_subscription_id:
      patch.asaas_subscription_id !== undefined
        ? patch.asaas_subscription_id
        : atual?.asaas_subscription_id || null,
    asaas_payment_id:
      patch.asaas_payment_id !== undefined
        ? patch.asaas_payment_id
        : atual?.asaas_payment_id || null,
    proxima_cobranca:
      patch.proxima_cobranca !== undefined
        ? patch.proxima_cobranca
        : atual?.proxima_cobranca || null,
    cancelamento_agendado:
      patch.cancelamento_agendado !== undefined
        ? patch.cancelamento_agendado === true
        : atual?.cancelamento_agendado === true,
    updated_at: agora
  };
  for (const campo of CAMPOS_TESTE) {
    if (patch[campo] !== undefined) registro[campo] = patch[campo];
  }

  if (atual) {
    const { data, error } = await sb
      .from("assinaturas")
      .update(registro)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) {
      console.error("upsertAssinatura update:", error.message);
      return null;
    }
    return data;
  }

  const { data, error } = await sb
    .from("assinaturas")
    .insert({ ...registro, created_at: agora })
    .select()
    .single();
  if (error) {
    console.error("upsertAssinatura insert:", error.message);
    return null;
  }
  return data;
}

async function expirarSeVencido(assinatura, hoje = dataIso()) {
  if (!assinatura) return assinatura;
  if (!STATUS_COM_ACESSO.includes(assinatura.status)) return assinatura;
  // No teste, o prazo é o fim do teste; a cobrança do dia seguinte troca o status para "ativa".
  // Um teste só expira por aqui se foi cancelado: sem cancelamento, quem decide é a cobrança.
  const emTeste = assinatura.status === "teste";
  if (emTeste && assinatura.cancelamento_agendado !== true) return assinatura;
  const temPrazo = emTeste || assinatura.plano === "anual" || assinatura.cancelamento_agendado === true;
  if (!temPrazo) return assinatura;
  const limite = String((emTeste ? assinatura.teste_ate : assinatura.proxima_cobranca) || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limite) || limite >= hoje) return assinatura;
  const atualizada = await upsertAssinatura(assinatura.user_id, { status: "cancelada" });
  await desativarPaginaDoUsuario(assinatura.user_id);
  return atualizada || { ...assinatura, status: "cancelada" };
}

/** Tira a página do ar quando o acesso acaba (fim do período pago ou do teste cancelado). */
async function desativarPaginaDoUsuario(userId) {
  if (!userId || !supabaseConfigured()) return;
  const { error } = await getSupabase()
    .from("representantes")
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .neq("controle_manual", true);
  if (error) console.error("desativarPaginaDoUsuario:", error.message);
}

async function listarAssinaturasLocais({ limit = 100 } = {}) {
  if (!supabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("assinaturas")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listarAssinaturasLocais:", error.message);
    return [];
  }
  return data || [];
}

async function vincularUserIdNaPagina(slug, userId, email) {
  if (!slug || !userId || !supabaseConfigured()) return null;
  const sb = getSupabase();
  const e = normalizarEmail(email);

  const { data: existente } = await sb
    .from("representantes")
    .select("id, user_id, email_cobranca, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (existente) {
    const patch = { updated_at: new Date().toISOString() };
    if (!existente.user_id) patch.user_id = userId;
    if (!existente.email_cobranca && e) patch.email_cobranca = e;
    if (Object.keys(patch).length === 1) {
      return existente;
    }
    const { data, error } = await sb
      .from("representantes")
      .update(patch)
      .eq("slug", slug)
      .select()
      .single();
    if (error) {
      console.error("vincularUserIdNaPagina update:", error.message);
      return null;
    }
    return data;
  }

  const { data, error } = await sb
    .from("representantes")
    .insert({
      slug,
      dados: { slug, nome: slug },
      publicado: false,
      user_id: userId,
      email_cobranca: e || null,
      ativo: true
    })
    .select()
    .single();
  if (error) {
    console.error("vincularUserIdNaPagina insert:", error.message);
    return null;
  }
  return data;
}

async function obterPaginaPorUserId(userId) {
  if (!userId || !supabaseConfigured()) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("representantes")
    .select(
      "id, slug, dados, publicado, email_cobranca, ativo, inadimplente_desde, controle_manual, user_id, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("obterPaginaPorUserId:", error.message);
    return null;
  }
  return data;
}

async function obterPaginaPorEmail(email) {
  const e = normalizarEmail(email);
  if (!e || !supabaseConfigured()) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("representantes")
    .select(
      "id, slug, dados, publicado, email_cobranca, ativo, inadimplente_desde, controle_manual, user_id, updated_at"
    )
    .eq("email_cobranca", e)
    .maybeSingle();
  if (error) {
    console.error("obterPaginaPorEmail:", error.message);
    return null;
  }
  return data;
}

async function associarUserIdPorEmail(email, userId) {
  const e = normalizarEmail(email);
  if (!e || !userId || !supabaseConfigured()) return null;
  const sb = getSupabase();
  const { data: lista, error } = await sb
    .from("representantes")
    .select("id, slug, user_id, email_cobranca")
    .eq("email_cobranca", e);
  if (error) {
    console.error("associarUserIdPorEmail:", error.message);
    return [];
  }
  const afetadas = [];
  for (const row of lista || []) {
    if (row.user_id) {
      afetadas.push(row);
      continue;
    }
    const { data, error: upErr } = await sb
      .from("representantes")
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .select()
      .single();
    if (upErr) {
      console.error("associarUserIdPorEmail update:", upErr.message);
      continue;
    }
    afetadas.push(data);
  }
  return afetadas;
}

module.exports = {
  STATUS_COM_ACESSO,
  DIAS_TESTE,
  desativarPaginaDoUsuario,
  obterAssinaturaPorUserId,
  upsertAssinatura,
  expirarSeVencido,
  listarAssinaturasLocais,
  vincularUserIdNaPagina,
  obterPaginaPorUserId,
  obterPaginaPorEmail,
  associarUserIdPorEmail,
  normalizarEmail
};
