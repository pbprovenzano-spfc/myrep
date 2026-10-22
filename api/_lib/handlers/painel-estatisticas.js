/* =========================================================
   GET /api/painel/estatisticas — visitas e cliques no WhatsApp
   da página do próprio rep, por dia, nos últimos 30 dias.
   ========================================================= */

const { json } = require("../pagamento");
const { exigirUsuario } = require("../auth");
const { obterPaginaPorUserId } = require("../assinaturas");
const { getSupabase, supabaseConfigured } = require("../supabase");

const DIAS = 30;

function diaBrasilia(data) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data);
}

/** Lista contínua de DIAS datas (AAAA-MM-DD), da mais antiga até hoje. */
function ultimosDias(agora = new Date()) {
  const lista = [];
  for (let i = DIAS - 1; i >= 0; i -= 1) {
    lista.push(diaBrasilia(new Date(agora.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return lista;
}

function montarResposta(linhas, agora = new Date()) {
  const porDia = new Map((linhas || []).map((l) => [String(l.dia).slice(0, 10), l]));
  const dias = ultimosDias(agora).map((dia) => ({
    dia,
    visitas: Number(porDia.get(dia)?.visitas) || 0,
    cliques: Number(porDia.get(dia)?.cliques_whatsapp) || 0
  }));
  const somar = (lista) =>
    lista.reduce((acc, d) => ({ visitas: acc.visitas + d.visitas, cliques: acc.cliques + d.cliques }), {
      visitas: 0,
      cliques: 0
    });
  return { dias, semana: somar(dias.slice(-7)), mes: somar(dias) };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { erro: "Método não permitido" });

  try {
    const { user } = await exigirUsuario(req);
    if (!supabaseConfigured()) return json(res, 503, { erro: "Supabase não configurado." });

    const pagina = await obterPaginaPorUserId(user.id);
    if (!pagina?.slug) return json(res, 200, { ok: true, ...montarResposta([]) });

    const desde = ultimosDias()[0];
    const { data, error } = await getSupabase()
      .from("estatisticas_diarias")
      .select("dia, visitas, cliques_whatsapp")
      .eq("slug", pagina.slug)
      .gte("dia", desde);
    if (error) {
      console.error("painel estatisticas:", error.message);
      return json(res, 503, { erro: "Estatísticas indisponíveis no momento." });
    }

    res.setHeader("Cache-Control", "no-store");
    return json(res, 200, { ok: true, ...montarResposta(data) });
  } catch (erro) {
    return json(res, erro.status || 500, { erro: erro.message || "Erro interno." });
  }
};

module.exports.montarResposta = montarResposta;
