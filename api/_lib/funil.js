/* =========================================================
   Funil de conversão e base para lembretes
   Contas (Supabase Auth) × assinaturas × páginas, sem rastreamento no site.
   ========================================================= */

const { getSupabase, supabaseConfigured } = require("./supabase");

const POR_PAGINA = 200;
const MAX_PAGINAS = 25;

async function listarTodosUsuarios() {
  const sb = getSupabase();
  const todos = [];
  for (let page = 1; page <= MAX_PAGINAS; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) throw error;
    const lista = data?.users || [];
    todos.push(...lista);
    if (lista.length < POR_PAGINA) break;
  }
  return todos;
}

async function carregarBase() {
  if (!supabaseConfigured()) return { usuarios: [], assinaturas: new Map(), paginas: new Map() };
  const sb = getSupabase();
  const [usuarios, ass, pags] = await Promise.all([
    listarTodosUsuarios(),
    sb.from("assinaturas").select("user_id, plano, status, created_at, updated_at").limit(10000),
    sb
      .from("representantes")
      .select("user_id, publicado, publicado_em, assistentePasso:dados->assistentePasso, assistenteConcluido:dados->assistenteConcluido")
      .not("user_id", "is", null)
      .limit(10000)
  ]);
  if (ass.error) throw ass.error;
  if (pags.error) throw pags.error;
  return {
    usuarios,
    assinaturas: new Map((ass.data || []).map((a) => [a.user_id, a])),
    paginas: new Map((pags.data || []).map((p) => [p.user_id, p]))
  };
}

/** Chegou a pagar: qualquer status além de "pendente" (ativa, inadimplente, cancelada). */
function pagou(assinatura) {
  return Boolean(assinatura && assinatura.status !== "pendente");
}

function contarFunil(base, desdeIso) {
  const etapas = { contas: 0, confirmadas: 0, assinaram: 0, pagaram: 0, publicaram: 0 };
  for (const u of base.usuarios) {
    if (desdeIso && String(u.created_at || "") < desdeIso) continue;
    etapas.contas += 1;
    if (u.email_confirmed_at) etapas.confirmadas += 1;
    const ass = base.assinaturas.get(u.id);
    if (ass) etapas.assinaram += 1;
    if (pagou(ass)) etapas.pagaram += 1;
    if (base.paginas.get(u.id)?.publicado) etapas.publicaram += 1;
  }
  return etapas;
}

/**
 * Onde o passo a passo para: entre quem pagou e ainda não publicou nem concluiu,
 * quantos estão em cada passo (sem endereço reservado = passo 1).
 */
function contarAssistente(base) {
  const porPasso = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 0]));
  let concluidos = 0;
  for (const u of base.usuarios) {
    if (!pagou(base.assinaturas.get(u.id))) continue;
    const pagina = base.paginas.get(u.id);
    if (pagina?.assistenteConcluido === true || pagina?.publicado) {
      concluidos += 1;
      continue;
    }
    const passo = Number(pagina?.assistentePasso) || 1;
    porPasso[Math.min(9, Math.max(1, passo))] += 1;
  }
  return { porPasso, concluidos };
}

async function calcularFunil() {
  const base = await carregarBase();
  const desde30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    ultimos30: contarFunil(base, desde30),
    total: contarFunil(base, null),
    assistente: contarAssistente(base)
  };
}

module.exports = { carregarBase, calcularFunil, contarAssistente, pagou };
