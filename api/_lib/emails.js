/* =========================================================
   E-mails automáticos ao cliente (Resend)
   Cada envio fica registrado em pagamentos_eventos para não repetir.
   ========================================================= */

const SITE = "https://www.myrep.com.br";

const EVENTO_EMAIL_ATRASO = "EMAIL_ATRASO_ENVIADO";
const EVENTO_EMAIL_FALTA_PUBLICAR = "EMAIL_FALTA_PUBLICAR_ENVIADO";
const EVENTO_EMAIL_SEM_ASSINATURA = "EMAIL_SEM_ASSINATURA_ENVIADO";

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

module.exports = {
  EVENTO_EMAIL_ATRASO,
  EVENTO_EMAIL_FALTA_PUBLICAR,
  EVENTO_EMAIL_SEM_ASSINATURA,
  emailsConfigurados,
  enviarEmail,
  emailAtraso,
  emailFaltaPublicar,
  emailSemAssinatura
};
