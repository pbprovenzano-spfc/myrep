/* =========================================================
   GET/POST /api/painel/suporte — pedidos de ajuda do representante
   ========================================================= */

const { Resend } = require("resend");
const { json, lerJsonBody } = require("../pagamento");
const { exigirUsuario } = require("../auth");
const { obterPaginaPorUserId } = require("../assinaturas");
const { getSupabase, supabaseConfigured } = require("../supabase");
const {
  criarMensagem,
  salvarAnexos,
  listarMensagens,
  atualizarMensagemEmail,
  mimePorNome,
  nomeArquivoSeguro
} = require("../inbox");
const {
  lerCorpo,
  parseMultipart,
  MAX_ANEXO,
  exigirAssinaturaAtiva
} = require("../painel-helpers");

async function respostasDe(mensagemIds) {
  if (!mensagemIds.length || !supabaseConfigured()) return new Map();
  const sb = getSupabase();
  const { data } = await sb
    .from("mensagens_respostas")
    .select("id, mensagem_id, autor, corpo, created_at")
    .in("mensagem_id", mensagemIds)
    .order("created_at", { ascending: true });
  const mapa = new Map();
  for (const r of data || []) {
    if (!mapa.has(r.mensagem_id)) mapa.set(r.mensagem_id, []);
    mapa.get(r.mensagem_id).push(r);
  }
  return mapa;
}

module.exports = async function handler(req, res) {
  try {
    const { user } = await exigirUsuario(req);
    const pagina = await obterPaginaPorUserId(user.id);

    if (req.method === "GET") {
      const { mensagens } = await listarMensagens({
        tipo: "suporte",
        userId: user.id,
        limit: 30
      });
      const ids = mensagens.map((m) => m.id);
      const respMap = await respostasDe(ids);
      const lista = mensagens.map((m) => ({
        ...m,
        respostas: respMap.get(m.id) || []
      }));
      return json(res, 200, { ok: true, mensagens: lista });
    }

    if (req.method !== "POST") {
      return json(res, 405, { erro: "Método não permitido" });
    }

    await exigirAssinaturaAtiva(user.id);

    const ct = req.headers["content-type"] || "";
    let assunto = "";
    let corpo = "";
    let arquivos = [];

    if (ct.includes("multipart/form-data")) {
      const raw = await lerCorpo(req);
      const parts = parseMultipart(raw, ct);
      const campo = (nome) => {
        const p = parts.find((x) => x.name === nome && !x.filename);
        return p ? p.data.toString("utf8").trim() : "";
      };
      assunto = campo("assunto");
      corpo = campo("mensagem") || campo("corpo");
      arquivos = parts
        .filter((p) => p.filename && p.data && p.data.length)
        .map((p) => ({
          nome: p.filename,
          data: p.data,
          mime: p.filename ? undefined : undefined,
          origem: "upload"
        }));
    } else {
      const body = await lerJsonBody(req);
      assunto = body.assunto || "";
      corpo = body.mensagem || body.corpo || "";
    }

    if (String(corpo).trim().length < 3) {
      return json(res, 400, { erro: "Descreva sua solicitação." });
    }

    const email = String(user.email || "")
      .trim()
      .toLowerCase();
    const nome =
      user.user_metadata?.nome || user.user_metadata?.full_name || email || "Representante";
    const slug = pagina?.slug || null;
    const assuntoFinal = assunto || "Pedido de suporte";
    const texto = [
      `Pedido de suporte (painel).`,
      ``,
      `E-mail da conta: ${email || "—"}`,
      `User ID: ${user.id}`,
      slug ? `Slug / página: ${slug}` : null,
      ``,
      `Assunto: ${assuntoFinal}`,
      ``,
      String(corpo).slice(0, 8000)
    ]
      .filter((linha) => linha !== null)
      .join("\n");

    const anexosValidos = arquivos
      .filter((a) => a.data && a.data.length && a.data.length <= MAX_ANEXO)
      .map((a) => {
        const original = String(a.nome || "arquivo").replace(/[/\\]/g, "").slice(0, 120) || "arquivo";
        return {
          nome: nomeArquivoSeguro(original, "arquivo"),
          data: a.data,
          mime: mimePorNome(original),
          origem: "upload",
          content: a.data.toString("base64")
        };
      });

    const msg = await criarMensagem({
      tipo: "suporte",
      assunto: assuntoFinal,
      remetenteNome: nome,
      remetenteEmail: email || null,
      slug,
      userId: user.id,
      dados: {
        email: email || null,
        userId: user.id,
        slug,
        assunto: assuntoFinal
      },
      corpo: texto
    });

    if (anexosValidos.length) {
      await salvarAnexos(msg.id, anexosValidos);
    }

    const apiKey = process.env.RESEND_API_KEY;
    const para = process.env.BRIEFING_TO_EMAIL || process.env.SUPPORT_EMAIL || "myrep.sup@gmail.com";
    const de = process.env.BRIEFING_FROM_EMAIL || "My Rep <onboarding@resend.dev>";
    let emailId = null;
    let emailErro = null;

    if (!apiKey) {
      emailErro = "Servidor sem RESEND_API_KEY configurada.";
    } else {
      try {
        const resend = new Resend(apiKey);
        const payload = {
          from: de,
          to: [para],
          replyTo: email || undefined,
          subject: `My Rep suporte — ${assuntoFinal}${slug ? ` (${slug})` : email ? ` (${email})` : ""}`,
          text: texto
        };
        if (anexosValidos.length) {
          payload.attachments = anexosValidos.map((a) => ({
            filename: a.nome,
            content: a.content
          }));
        }
        const { data, error } = await resend.emails.send(payload);
        if (error) {
          emailErro = error.message || "Falha ao enviar e-mail.";
        } else {
          emailId = data && data.id;
        }
      } catch (erroEmail) {
        console.error("painel suporte e-mail:", erroEmail);
        emailErro = erroEmail.message || "Falha ao enviar e-mail.";
      }
    }

    if (msg?.id) {
      await atualizarMensagemEmail(msg.id, { emailId, emailErro });
    }

    return json(res, 201, {
      ok: true,
      mensagem: msg,
      aviso: "Solicitação enviada. Responderemos em breve."
    });
  } catch (erro) {
    console.error("painel suporte:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro interno." });
  }
};

module.exports.config = {
  api: { bodyParser: false }
};
