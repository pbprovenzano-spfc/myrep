/* =========================================================
   Assinaturas locais (espelho do Asaas por user_id)
   ========================================================= */

const { getSupabase, supabaseConfigured } = require("./supabase");

const STATUS_OK = new Set(["ativa", "inadimplente", "cancelada", "pendente"]);

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
    updated_at: agora
  };

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
  obterAssinaturaPorUserId,
  upsertAssinatura,
  listarAssinaturasLocais,
  vincularUserIdNaPagina,
  obterPaginaPorUserId,
  obterPaginaPorEmail,
  associarUserIdPorEmail,
  normalizarEmail
};
