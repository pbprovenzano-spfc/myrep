/* =========================================================
   Inbox interna — Supabase (service role) + fallback local /inbox
   ========================================================= */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getSupabase, supabaseConfigured } = require("./supabase");

const DIR_INBOX = path.join(__dirname, "..", "..", "inbox");
const STATUS_OK = new Set(["nova", "em_andamento", "publicada", "arquivada"]);
const TIPOS_OK = new Set(["briefing", "alteracao"]);

function inboxBucket() {
  return process.env.SUPABASE_INBOX_BUCKET || "inbox";
}

function mimePorNome(nome) {
  const ext = String(nome || "")
    .split(".")
    .pop()
    .toLowerCase();
  const mapa = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    zip: "application/zip",
    json: "application/json"
  };
  return mapa[ext] || "application/octet-stream";
}

function nomeArquivoSeguro(nome, fallback = "arquivo") {
  const base = String(nome || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return base || fallback;
}

function pastaLocal(mensagemId) {
  return path.join(DIR_INBOX, mensagemId);
}

function lerMensagemLocal(mensagemId) {
  const metaPath = path.join(pastaLocal(mensagemId), "mensagem.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

function escreverMensagemLocal(mensagem) {
  const pasta = pastaLocal(mensagem.id);
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, "mensagem.json"), JSON.stringify(mensagem, null, 2));
}

function listarPastasLocais() {
  if (!fs.existsSync(DIR_INBOX)) return [];
  return fs
    .readdirSync(DIR_INBOX, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

async function criarMensagem({
  tipo,
  assunto,
  remetenteNome,
  remetenteEmail,
  slug,
  dados,
  corpo,
  emailId,
  emailErro
}) {
  if (!TIPOS_OK.has(tipo)) {
    throw Object.assign(new Error("Tipo de mensagem inválido."), { status: 400 });
  }

  const registro = {
    tipo,
    assunto: String(assunto || "").slice(0, 300),
    remetente_nome: remetenteNome ? String(remetenteNome).slice(0, 160) : null,
    remetente_email: remetenteEmail ? String(remetenteEmail).trim().toLowerCase().slice(0, 160) : null,
    slug: slug ? String(slug).slice(0, 80) : null,
    dados: dados && typeof dados === "object" ? dados : {},
    corpo: String(corpo || ""),
    lida: false,
    status: "nova",
    email_id: emailId || null,
    email_erro: emailErro || null
  };

  if (supabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("mensagens").insert(registro).select().single();
    if (error) {
      console.error("criarMensagem supabase:", error.message);
      throw Object.assign(new Error("Falha ao gravar mensagem na inbox."), { status: 500 });
    }
    return data;
  }

  const local = {
    id: crypto.randomUUID(),
    ...registro,
    created_at: new Date().toISOString(),
    anexos: []
  };
  escreverMensagemLocal(local);
  return local;
}

async function atualizarMensagemEmail(mensagemId, { emailId, emailErro }) {
  if (!mensagemId) return null;
  if (supabaseConfigured()) {
    const sb = getSupabase();
    const patch = {};
    if (emailId !== undefined) patch.email_id = emailId;
    if (emailErro !== undefined) patch.email_erro = emailErro;
    const { data, error } = await sb
      .from("mensagens")
      .update(patch)
      .eq("id", mensagemId)
      .select()
      .single();
    if (error) {
      console.error("atualizarMensagemEmail:", error.message);
      return null;
    }
    return data;
  }
  const msg = lerMensagemLocal(mensagemId);
  if (!msg) return null;
  if (emailId !== undefined) msg.email_id = emailId;
  if (emailErro !== undefined) msg.email_erro = emailErro;
  escreverMensagemLocal(msg);
  return msg;
}

/**
 * @param {string} mensagemId
 * @param {{ nome: string, data: Buffer, mime?: string, origem?: 'zip'|'upload' }[]} arquivos
 */
async function salvarAnexos(mensagemId, arquivos) {
  if (!mensagemId || !Array.isArray(arquivos) || !arquivos.length) return [];

  const salvos = [];

  if (supabaseConfigured()) {
    const sb = getSupabase();
    const bucket = inboxBucket();

    for (const arq of arquivos) {
      if (!arq || !arq.data || !arq.data.length) continue;
      const nome = nomeArquivoSeguro(arq.nome, "arquivo");
      const caminho = `${mensagemId}/${nome}`;
      const mime = arq.mime || mimePorNome(nome);
      const origem = arq.origem === "zip" ? "zip" : "upload";

      const { error: upErr } = await sb.storage.from(bucket).upload(caminho, arq.data, {
        contentType: mime,
        upsert: true
      });
      if (upErr) {
        console.error("salvarAnexos upload:", upErr.message, caminho);
        continue;
      }

      const { data, error } = await sb
        .from("mensagens_anexos")
        .insert({
          mensagem_id: mensagemId,
          nome,
          caminho,
          tipo: mime,
          tamanho: arq.data.length,
          origem
        })
        .select()
        .single();

      if (error) {
        console.error("salvarAnexos meta:", error.message);
        continue;
      }
      salvos.push(data);
    }
    return salvos;
  }

  const msg = lerMensagemLocal(mensagemId);
  if (!msg) return [];
  const pasta = pastaLocal(mensagemId);
  fs.mkdirSync(pasta, { recursive: true });
  if (!Array.isArray(msg.anexos)) msg.anexos = [];

  for (const arq of arquivos) {
    if (!arq || !arq.data || !arq.data.length) continue;
    const nome = nomeArquivoSeguro(arq.nome, "arquivo");
    const mime = arq.mime || mimePorNome(nome);
    const origem = arq.origem === "zip" ? "zip" : "upload";
    const caminhoRel = path.join(mensagemId, nome);
    fs.writeFileSync(path.join(pasta, nome), arq.data);
    const meta = {
      id: crypto.randomUUID(),
      mensagem_id: mensagemId,
      nome,
      caminho: caminhoRel.replace(/\\/g, "/"),
      tipo: mime,
      tamanho: arq.data.length,
      origem,
      created_at: new Date().toISOString()
    };
    msg.anexos.push(meta);
    salvos.push(meta);
  }
  escreverMensagemLocal(msg);
  return salvos;
}

function filtrarLista(lista, { tipo, status, busca, limit = 50, offset = 0 } = {}) {
  let out = lista;
  if (tipo && TIPOS_OK.has(tipo)) out = out.filter((m) => m.tipo === tipo);
  if (status && STATUS_OK.has(status)) out = out.filter((m) => m.status === status);
  if (busca) {
    const q = String(busca).toLowerCase();
    out = out.filter((m) => {
      const blob = [
        m.assunto,
        m.remetente_nome,
        m.remetente_email,
        m.slug,
        m.corpo
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }
  out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const total = out.length;
  return { mensagens: out.slice(offset, offset + limit), total };
}

async function listarMensagens(filtros = {}) {
  const limit = Math.min(Number(filtros.limit) || 50, 100);
  const offset = Math.max(Number(filtros.offset) || 0, 0);

  if (supabaseConfigured()) {
    const sb = getSupabase();
    let q = sb
      .from("mensagens")
      .select(
        "id, tipo, assunto, remetente_nome, remetente_email, slug, lida, status, email_id, email_erro, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filtros.tipo && TIPOS_OK.has(filtros.tipo)) q = q.eq("tipo", filtros.tipo);
    if (filtros.status && STATUS_OK.has(filtros.status)) q = q.eq("status", filtros.status);
    if (filtros.busca) {
      const raw = String(filtros.busca).replace(/[%*,()]/g, "").trim().slice(0, 80);
      if (raw) {
        const b = `%${raw}%`;
        q = q.or(
          `assunto.ilike.${b},remetente_nome.ilike.${b},remetente_email.ilike.${b},slug.ilike.${b}`
        );
      }
    }

    const { data, error, count } = await q;
    if (error) {
      console.error("listarMensagens:", error.message);
      return { mensagens: [], total: 0 };
    }
    return { mensagens: data || [], total: count || 0 };
  }

  const todas = listarPastasLocais()
    .map(lerMensagemLocal)
    .filter(Boolean)
    .map(({ anexos, dados, corpo, ...rest }) => rest);
  return filtrarLista(todas, { ...filtros, limit, offset });
}

async function obterMensagem(id) {
  if (!id) return null;

  if (supabaseConfigured()) {
    const sb = getSupabase();
    const { data: msg, error } = await sb.from("mensagens").select("*").eq("id", id).single();
    if (error || !msg) return null;

    const { data: anexos } = await sb
      .from("mensagens_anexos")
      .select("*")
      .eq("mensagem_id", id)
      .order("created_at", { ascending: true });

    const bucket = inboxBucket();
    const comUrl = await Promise.all(
      (anexos || []).map(async (a) => {
        let url = null;
        try {
          const { data: signed } = await sb.storage
            .from(bucket)
            .createSignedUrl(a.caminho, 60);
          url = signed?.signedUrl || null;
        } catch (erro) {
          console.error("signedUrl:", erro.message || erro);
        }
        return { ...a, url };
      })
    );

    return { ...msg, anexos: comUrl };
  }

  const msg = lerMensagemLocal(id);
  if (!msg) return null;
  const anexos = (msg.anexos || []).map((a) => {
    const abs = path.join(DIR_INBOX, a.caminho);
    let url = null;
    if (fs.existsSync(abs)) {
      const b64 = fs.readFileSync(abs).toString("base64");
      url = `data:${a.tipo || mimePorNome(a.nome)};base64,${b64}`;
    }
    return { ...a, url };
  });
  return { ...msg, anexos };
}

async function marcarLida(id, lida = true) {
  if (!id) return null;
  if (supabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("mensagens")
      .update({ lida: !!lida })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      console.error("marcarLida:", error.message);
      return null;
    }
    return data;
  }
  const msg = lerMensagemLocal(id);
  if (!msg) return null;
  msg.lida = !!lida;
  escreverMensagemLocal(msg);
  return msg;
}

async function mudarStatus(id, status) {
  if (!id || !STATUS_OK.has(status)) {
    throw Object.assign(new Error("Status inválido."), { status: 400 });
  }
  if (supabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("mensagens")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      console.error("mudarStatus:", error.message);
      throw Object.assign(new Error("Falha ao atualizar status."), { status: 500 });
    }
    return data;
  }
  const msg = lerMensagemLocal(id);
  if (!msg) return null;
  msg.status = status;
  escreverMensagemLocal(msg);
  return msg;
}

async function excluirMensagem(id) {
  if (!id) return false;

  if (supabaseConfigured()) {
    const sb = getSupabase();
    const bucket = inboxBucket();
    const { data: anexos } = await sb
      .from("mensagens_anexos")
      .select("caminho")
      .eq("mensagem_id", id);
    const caminhos = (anexos || []).map((a) => a.caminho).filter(Boolean);
    if (caminhos.length) {
      const { error: stErr } = await sb.storage.from(bucket).remove(caminhos);
      if (stErr) console.error("excluirMensagem storage:", stErr.message);
    }
    const { error } = await sb.from("mensagens").delete().eq("id", id);
    if (error) {
      console.error("excluirMensagem:", error.message);
      return false;
    }
    return true;
  }

  const pasta = pastaLocal(id);
  if (!fs.existsSync(pasta)) return false;
  fs.rmSync(pasta, { recursive: true, force: true });
  return true;
}

async function contarNaoLidas() {
  if (supabaseConfigured()) {
    const sb = getSupabase();
    const { count, error } = await sb
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("lida", false);
    if (error) {
      console.error("contarNaoLidas:", error.message);
      return 0;
    }
    return count || 0;
  }
  return listarPastasLocais()
    .map(lerMensagemLocal)
    .filter((m) => m && !m.lida).length;
}

module.exports = {
  criarMensagem,
  atualizarMensagemEmail,
  salvarAnexos,
  listarMensagens,
  obterMensagem,
  marcarLida,
  mudarStatus,
  excluirMensagem,
  contarNaoLidas,
  mimePorNome,
  nomeArquivoSeguro,
  DIR_INBOX
};
