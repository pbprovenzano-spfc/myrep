/* =========================================================
   Helpers multipart compartilhados pelo painel
   ========================================================= */

const { mimePorNome, nomeArquivoSeguro } = require("./inbox");
const { storagePublicUrl, getSupabase, supabaseConfigured } = require("./supabase");

const MAX_BYTES = 4.5 * 1024 * 1024;
const MAX_ANEXO = 3.5 * 1024 * 1024;

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        reject(Object.assign(new Error("Pacote muito grande (máx. ~4 MB)."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  const boundary = m && (m[1] || m[2]);
  if (!boundary) throw Object.assign(new Error("Content-Type inválido."), { status: 400 });

  const sep = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(sep) + sep.length;

  while (start < buffer.length) {
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const next = buffer.indexOf(sep, start);
    if (next < 0) break;

    let part = buffer.slice(start, next);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.slice(0, -2);
    }

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const headers = part.slice(0, headerEnd).toString("utf8");
      const body = part.slice(headerEnd + 4);
      const nameMatch = /name="([^"]+)"/i.exec(headers);
      const fileMatch = /filename="([^"]*)"/i.exec(headers);
      if (nameMatch) {
        parts.push({
          name: nameMatch[1],
          filename: fileMatch ? fileMatch[1] : null,
          data: body
        });
      }
    }

    start = next + sep.length;
  }

  return parts;
}

function assetsBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || "assets-clientes";
}

async function uploadAsset(slug, nome, data, mime) {
  if (!supabaseConfigured()) {
    throw Object.assign(new Error("Storage não configurado."), { status: 503 });
  }
  const sb = getSupabase();
  const caminho = `${slug}/${nome}`;
  const { error } = await sb.storage.from(assetsBucket()).upload(caminho, data, {
    contentType: mime || mimePorNome(nome),
    upsert: true
  });
  if (error) {
    throw Object.assign(new Error(`Falha no upload: ${error.message}`), { status: 500 });
  }
  return storagePublicUrl(slug, nome);
}

async function criarUrlUpload(slug, nome, { upsert = false } = {}) {
  if (!supabaseConfigured()) {
    throw Object.assign(new Error("Storage não configurado."), { status: 503 });
  }
  const sb = getSupabase();
  const caminho = `${slug}/${nome}`;
  if (upsert) {
    await sb.storage.from(assetsBucket()).remove([caminho]);
  }
  let result = await sb.storage.from(assetsBucket()).createSignedUploadUrl(caminho, { upsert: true });
  if (result.error) {
    result = await sb.storage.from(assetsBucket()).createSignedUploadUrl(caminho);
  }
  const data = result.data;
  const error = result.error;
  if (error || !data?.signedUrl) {
    throw Object.assign(new Error(`Falha ao preparar upload: ${error?.message || "sem URL"}`), {
      status: 500
    });
  }
  return {
    path: data.path || caminho,
    token: data.token,
    signedUrl: data.signedUrl,
    arquivo: nome
  };
}

function nomeAssetInformado(valor) {
  const bruto = String(valor || "")
    .split("/")
    .pop()
    .trim();
  const seguro = nomeArquivoSeguro(bruto, "");
  return seguro || "";
}

async function removerAsset(slug, nome) {
  if (!supabaseConfigured() || !nome) return;
  const sb = getSupabase();
  await sb.storage.from(assetsBucket()).remove([`${slug}/${nome}`]);
}

async function exigirAssinaturaAtiva(userId) {
  const { obterAssinaturaPorUserId } = require("./assinaturas");
  const assinatura = await obterAssinaturaPorUserId(userId);
  if (!assinatura || !["ativa", "inadimplente"].includes(assinatura.status)) {
    throw Object.assign(new Error("Assinatura ativa necessária para esta ação."), { status: 403 });
  }
  return assinatura;
}

function paginaResumo(pagina) {
  const dados = pagina.dados && typeof pagina.dados === "object" ? pagina.dados : {};
  return {
    slug: pagina.slug,
    publicado: pagina.publicado !== false,
    publicadoEm: pagina.publicado_em || null,
    ativo: pagina.ativo !== false,
    nome: dados.nome || dados.empresa || pagina.slug,
    catalogos: Array.isArray(dados.catalogos) ? dados.catalogos : [],
    marcas: Array.isArray(dados.marcas) ? dados.marcas : [],
    foto: dados.foto || null,
    fotoTipo: dados.fotoTipo || "pessoa",
    url: `/${pagina.slug}/`,
    dados
  };
}

module.exports = {
  MAX_BYTES,
  MAX_ANEXO,
  lerCorpo,
  parseMultipart,
  uploadAsset,
  criarUrlUpload,
  nomeAssetInformado,
  removerAsset,
  exigirAssinaturaAtiva,
  paginaResumo,
  nomeArquivoSeguro,
  mimePorNome
};
