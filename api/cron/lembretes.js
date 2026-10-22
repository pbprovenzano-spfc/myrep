/* =========================================================
   GET /api/cron/lembretes — cron diário da Vercel (vercel.json)
   - Conta criada há 1–7 dias, e-mail confirmado, sem assinatura paga → lembrete dos planos
   - Assinatura paga há 2–30 dias e página não publicada → lembrete para publicar
   Cada lembrete sai uma vez por usuário (registro em pagamentos_eventos).
   ========================================================= */

const { json } = require("../_lib/pagamento");
const { supabaseConfigured } = require("../_lib/supabase");
const { carregarBase, pagou } = require("../_lib/funil");
const { chavesComEventos, registrarPagamentoEvento } = require("../_lib/acessos");
const {
  EVENTO_EMAIL_FALTA_PUBLICAR,
  EVENTO_EMAIL_SEM_ASSINATURA,
  emailsConfigurados,
  enviarEmail,
  emailFaltaPublicar,
  emailSemAssinatura
} = require("../_lib/emails");

const DIA = 24 * 60 * 60 * 1000;
const MAX_ENVIOS = 50;

function idadeDias(iso, agora) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? (agora - t) / DIA : null;
}

function nomeDoUsuario(u) {
  const meta = u.user_metadata || {};
  return meta.nome || meta.name || meta.full_name || "";
}

/** Decide qual lembrete cada usuário deve receber agora (no máximo um). */
function escolherLembretes(base, agora) {
  const fila = [];
  for (const u of base.usuarios) {
    if (!u.email || !u.email_confirmed_at) continue;
    const ass = base.assinaturas.get(u.id);
    const pagina = base.paginas.get(u.id);

    if (!pagou(ass)) {
      const idade = idadeDias(u.created_at, agora);
      if (idade != null && idade >= 1 && idade <= 7) {
        fila.push({ usuario: u, evento: EVENTO_EMAIL_SEM_ASSINATURA });
      }
      continue;
    }

    if (ass.status === "cancelada" || pagina?.publicado) continue;
    const idade = idadeDias(ass.created_at, agora);
    if (idade != null && idade >= 2 && idade <= 30) {
      fila.push({ usuario: u, evento: EVENTO_EMAIL_FALTA_PUBLICAR });
    }
  }
  return fila;
}

module.exports = async function handler(req, res) {
  // A Vercel envia "Authorization: Bearer <CRON_SECRET>" quando a variável existe.
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return json(res, 503, { erro: "CRON_SECRET não configurado." });
  if (req.headers.authorization !== `Bearer ${segredo}`) {
    return json(res, 401, { erro: "Não autorizado." });
  }
  if (!supabaseConfigured() || !emailsConfigurados()) {
    return json(res, 503, { erro: "Supabase ou Resend não configurado." });
  }

  try {
    const agora = Date.now();
    const base = await carregarBase();
    const fila = escolherLembretes(base, agora);
    const eventos = [EVENTO_EMAIL_SEM_ASSINATURA, EVENTO_EMAIL_FALTA_PUBLICAR];
    const enviados = await chavesComEventos(
      eventos,
      fila.map((f) => f.usuario.id)
    );

    const resultado = { candidatos: fila.length, enviados: 0, falhas: 0, pulados: 0 };
    for (const { usuario, evento } of fila) {
      if (enviados.get(evento)?.has(usuario.id)) {
        resultado.pulados += 1;
        continue;
      }
      if (resultado.enviados >= MAX_ENVIOS) break;
      const modelo =
        evento === EVENTO_EMAIL_SEM_ASSINATURA
          ? emailSemAssinatura({ nome: nomeDoUsuario(usuario) })
          : emailFaltaPublicar({ nome: nomeDoUsuario(usuario) });
      const envio = await enviarEmail({ para: usuario.email, ...modelo });
      if (envio.ok) {
        resultado.enviados += 1;
        await registrarPagamentoEvento({
          event: evento,
          paymentId: usuario.id,
          payload: { email: usuario.email }
        });
      } else {
        resultado.falhas += 1;
        console.error("cron lembretes:", usuario.id, envio.erro);
      }
    }

    console.log("cron lembretes:", resultado);
    return json(res, 200, { ok: true, ...resultado });
  } catch (erro) {
    console.error("cron lembretes:", erro);
    return json(res, 500, { erro: erro.message || "Falha nos lembretes." });
  }
};

module.exports.escolherLembretes = escolherLembretes;
