/* =========================================================
   E-mails automáticos ao cliente (Resend)
   Cada envio fica registrado em pagamentos_eventos para não repetir.
   ========================================================= */

const SITE = "https://www.myrep.com.br";

const EVENTO_EMAIL_ATRASO = "EMAIL_ATRASO_ENVIADO";
const EVENTO_EMAIL_FALTA_PUBLICAR = "EMAIL_FALTA_PUBLICAR_ENVIADO";
const EVENTO_EMAIL_SEM_ASSINATURA = "EMAIL_SEM_ASSINATURA_ENVIADO";
const EVENTO_ALERTA_FALHA = "ALERTA_FALHA_ENVIADO";

function suporte() {
  return process.env.SUPPORT_EMAIL || process.env.BRIEFING_TO_EMAIL || "myrep.sup@gmail.com";
}

function emailsConfigurados() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function enviarEmail({ para, assunto, linhas }) {
  if (!emailsConfigurados()) return { ok: false, erro: "RESEND_API_KEY ausente" };
  const { Resend } = require("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const de = process.env.BRIEFING_FROM_EMAIL || "My Rep <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from: de,
    to: [para],
    subject: assunto,
    text: linhas.join("\n")
  });
  if (error) return { ok: false, erro: error.message || String(error) };
  return { ok: true };
}

function saudacao(nome) {
  const primeiro = String(nome || "").trim().split(/\s+/)[0];
  return primeiro ? `Olá, ${primeiro},` : "Olá,";
}

function emailAtraso({ nome, valor, linkFatura }) {
  return {
    assunto: "Seu pagamento do My Rep está em atraso",
    linhas: [
      saudacao(nome),
      "",
      `A cobrança da sua assinatura${valor ? ` (R$ ${valor})` : ""} venceu e ainda não foi paga.`,
      "Para manter sua página no ar, regularize o pagamento:",
      "",
      ...(linkFatura ? [`Pagar a fatura: ${linkFatura}`, ""] : []),
      `Trocar o cartão ou ver a assinatura: ${SITE}/painel/assinatura/`,
      "",
      "Se já pagou, desconsidere este aviso — a confirmação pode levar alguns minutos.",
      `Dúvidas? Escreva para ${suporte()}.`,
      "",
      "— Equipe My Rep"
    ]
  };
}

function emailFaltaPublicar({ nome }) {
  return {
    assunto: "Sua página do My Rep ainda não está no ar",
    linhas: [
      saudacao(nome),
      "",
      "Sua assinatura está ativa, mas a página ainda não foi publicada — seus clientes ainda não conseguem vê-la.",
      "",
      "Leva poucos minutos:",
      "1. Escolha seu endereço (myrep.com.br/seu-nome).",
      "2. Coloque foto, WhatsApp, marcas e catálogos.",
      "3. Toque em Publicar e compartilhe o link.",
      "",
      `Abrir o painel: ${SITE}/painel/`,
      `Veja exemplos prontos: ${SITE}/#exemplos`,
      "",
      `Dúvidas? Escreva para ${suporte()}.`,
      "",
      "— Equipe My Rep"
    ]
  };
}

function emailSemAssinatura({ nome }) {
  return {
    assunto: "Falta só um passo para criar sua página no My Rep",
    linhas: [
      saudacao(nome),
      "",
      "Sua conta no My Rep está criada. Para montar e publicar sua página, escolha um plano:",
      "",
      "- Mensal: R$ 17,90 por mês no cartão. Cancele quando quiser.",
      "- Anual: R$ 130,80 — 12× de R$ 10,90 sem juros no cartão, ou à vista no PIX.",
      "",
      `Escolher o plano: ${SITE}/painel/`,
      `Veja como fica: ${SITE}/#exemplos`,
      "",
      `Dúvidas? Escreva para ${suporte()}.`,
      "",
      "— Equipe My Rep"
    ]
  };
}

function destinoAlertas() {
  return process.env.ALERTA_EMAIL || process.env.BRIEFING_TO_EMAIL || suporte();
}

/**
 * Registra a falha no log e avisa o admin por e-mail.
 * No máximo um aviso por contexto por hora, para uma pane não lotar a caixa.
 * Nunca lança: quem chama segue o fluxo normal.
 */
async function registrarFalha(contexto, erro, extra = {}) {
  const mensagem = (erro && (erro.message || String(erro))) || "erro desconhecido";
  console.error(`${contexto}:`, mensagem);
  if (!emailsConfigurados()) return;
  try {
    const { jaRegistrouEvento, registrarPagamentoEvento } = require("./acessos");
    const chave = `${contexto}|${new Date().toISOString().slice(0, 13)}`;
    if (await jaRegistrouEvento(EVENTO_ALERTA_FALHA, chave)) return;
    const detalhes = Object.entries(extra)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}: ${v}`);
    const envio = await enviarEmail({
      para: destinoAlertas(),
      assunto: `[My Rep] Falha: ${contexto}`,
      linhas: [
        `Contexto: ${contexto}`,
        `Erro: ${mensagem}`,
        ...detalhes,
        `Quando: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        "",
        "Outras falhas do mesmo tipo na próxima hora não geram novo aviso.",
        "Logs completos: Vercel → projeto myrep → Logs."
      ]
    });
    if (envio.ok) {
      await registrarPagamentoEvento({ event: EVENTO_ALERTA_FALHA, paymentId: chave, payload: { mensagem, ...extra } });
    } else {
      console.error("alerta de falha não enviado:", envio.erro);
    }
  } catch (erroAlerta) {
    console.error("alerta de falha:", erroAlerta.message || erroAlerta);
  }
}

module.exports = {
  EVENTO_EMAIL_ATRASO,
  EVENTO_EMAIL_FALTA_PUBLICAR,
  EVENTO_EMAIL_SEM_ASSINATURA,
  emailsConfigurados,
  enviarEmail,
  registrarFalha,
  emailAtraso,
  emailFaltaPublicar,
  emailSemAssinatura
};
