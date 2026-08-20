/* =========================================================
   GET/POST /api/painel/suporte — pedidos de ajuda do representante
   ========================================================= */

const { json, lerJsonBody } = require("../pagamento");
const { exigirUsuario } = require("../auth");
const { obterPaginaPorUserId } = require("../assinaturas");
const { getSupabase, supabaseConfigured } = require("../supabase");
const { criarMensagem, salvarAnexos, listarMensagens } = require("../inbox");
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

    const nome =
      user.user_metadata?.nome || user.user_metadata?.full_name || user.email || "Representante";
    const msg = await criarMensagem({
      tipo: "suporte",
      assunto: assunto || "Pedido de suporte",
      remetenteNome: nome,
      remetenteEmail: user.email,
      slug: pagina?.slug || null,
      userId: user.id,
      corpo: String(corpo).slice(0, 8000)
    });

    const anexosValidos = arquivos.filter((a) => a.data.length <= MAX_ANEXO);
    if (anexosValidos.length) {
      await salvarAnexos(msg.id, anexosValidos);
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
