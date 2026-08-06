/* =========================================================
   GET/PUT /api/painel/pagina — ler/editar dados da página
   ========================================================= */

const { json, lerJsonBody } = require("../pagamento");
const { exigirUsuario } = require("../auth");
const { obterPaginaPorUserId } = require("../assinaturas");
const { getSupabase, supabaseConfigured, storagePublicUrl } = require("../supabase");
const { nomeArquivoSeguro, mimePorNome } = require("../inbox");

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

async function removerAsset(slug, nome) {
  if (!supabaseConfigured() || !nome) return;
  const sb = getSupabase();
  await sb.storage.from(assetsBucket()).remove([`${slug}/${nome}`]);
}

function paginaResumo(pagina) {
  const dados = pagina.dados && typeof pagina.dados === "object" ? pagina.dados : {};
  return {
    slug: pagina.slug,
    publicado: pagina.publicado !== false,
    ativo: pagina.ativo !== false,
    nome: dados.nome || dados.empresa || pagina.slug,
    catalogos: Array.isArray(dados.catalogos) ? dados.catalogos : [],
    marcas: Array.isArray(dados.marcas) ? dados.marcas : [],
    foto: dados.foto || null,
    url: `/${pagina.slug}/`,
    dados
  };
}

module.exports = async function handler(req, res) {
  try {
    const { user } = await exigirUsuario(req);
    const pagina = await obterPaginaPorUserId(user.id);
    if (!pagina) {
      return json(res, 404, {
        erro: "Você ainda não tem uma página vinculada. Envie o briefing primeiro."
      });
    }

    if (req.method === "GET") {
      return json(res, 200, { ok: true, pagina: paginaResumo(pagina) });
    }

    if (req.method !== "PUT" && req.method !== "POST") {
      return json(res, 405, { erro: "Método não permitido" });
    }

    if (!supabaseConfigured()) {
      return json(res, 503, { erro: "Supabase não configurado para editar página." });
    }

    const slug = pagina.slug;
    let dados = { ...(pagina.dados && typeof pagina.dados === "object" ? pagina.dados : {}) };
    let catalogos = Array.isArray(dados.catalogos) ? [...dados.catalogos] : [];
    let marcas = Array.isArray(dados.marcas) ? [...dados.marcas] : [];

    const ct = req.headers["content-type"] || "";
    let acao = "";
    let campos = {};
    let arquivos = [];

    if (ct.includes("multipart/form-data")) {
      const raw = await lerCorpo(req);
      const parts = parseMultipart(raw, ct);
      const campo = (nome) => {
        const p = parts.find((x) => x.name === nome && !x.filename);
        return p ? p.data.toString("utf8").trim() : "";
      };
      acao = campo("acao");
      campos = {
        titulo: campo("titulo"),
        nome: campo("nome"),
        arquivoNome: campo("arquivo"),
        tipo: campo("tipo") || "PDF"
      };
      arquivos = parts.filter((p) => p.filename && p.data && p.data.length);
    } else {
      const body = await lerJsonBody(req);
      acao = String(body.acao || "").trim();
      campos = body;
    }

    if (acao === "catalogo_add") {
      const file = arquivos[0];
      if (!file) return json(res, 400, { erro: "Envie o arquivo do catálogo." });
      if (file.data.length > MAX_ANEXO) {
        return json(res, 413, { erro: "Arquivo grande demais." });
      }
      const ext = (file.filename.split(".").pop() || "pdf").toLowerCase();
      const base = nomeArquivoSeguro(
        campos.titulo || file.filename.replace(/\.[^.]+$/, ""),
        "catalogo"
      );
      const nomeArq = `${base}.${ext}`.slice(0, 120);
      await uploadAsset(slug, nomeArq, file.data, mimePorNome(nomeArq));
      catalogos.push({
        titulo: (campos.titulo || base).slice(0, 120),
        arquivo: nomeArq,
        tipo: campos.tipo || (ext === "pdf" ? "PDF" : "Arquivo")
      });
    } else if (acao === "catalogo_remover") {
      const alvo = String(campos.arquivoNome || campos.arquivo || "").trim();
      const item = catalogos.find((c) => c.arquivo === alvo || c.titulo === alvo);
      if (item?.arquivo) await removerAsset(slug, item.arquivo);
      catalogos = catalogos.filter((c) => c.arquivo !== alvo && c.titulo !== alvo);
    } else if (acao === "marca_add") {
      const file = arquivos[0];
      const nomeMarca = String(campos.nome || "").trim().slice(0, 120);
      if (!nomeMarca) return json(res, 400, { erro: "Informe o nome da marca." });
      let logo = null;
      if (file) {
        if (file.data.length > MAX_ANEXO) {
          return json(res, 413, { erro: "Arquivo grande demais." });
        }
        const ext = (file.filename.split(".").pop() || "png").toLowerCase();
        logo = `marca-${nomeArquivoSeguro(nomeMarca, "marca")}.${ext}`.slice(0, 120);
        await uploadAsset(slug, logo, file.data, mimePorNome(logo));
      }
      const idx = marcas.findIndex(
        (m) => String(m.nome || "").toLowerCase() === nomeMarca.toLowerCase()
      );
      const entrada = { nome: nomeMarca, ...(logo ? { logo } : {}) };
      if (idx >= 0) {
        if (!logo && marcas[idx].logo) entrada.logo = marcas[idx].logo;
        marcas[idx] = entrada;
      } else {
        marcas.push(entrada);
      }
    } else if (acao === "marca_remover") {
      const nomeMarca = String(campos.nome || "").trim().toLowerCase();
      const item = marcas.find((m) => String(m.nome || "").toLowerCase() === nomeMarca);
      if (item?.logo) await removerAsset(slug, item.logo);
      marcas = marcas.filter((m) => String(m.nome || "").toLowerCase() !== nomeMarca);
    } else {
      return json(res, 400, {
        erro: "Ação inválida. Use catalogo_add, catalogo_remover, marca_add ou marca_remover."
      });
    }

    dados = { ...dados, catalogos, marcas };
    const sb = getSupabase();
    const { data, error } = await sb
      .from("representantes")
      .update({ dados, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("painel pagina update:", error.message);
      return json(res, 500, { erro: "Falha ao salvar alterações." });
    }

    return json(res, 200, {
      ok: true,
      pagina: paginaResumo(data),
      aviso:
        "Alterações salvas no banco. A página pública atualiza no próximo deploy/build do site."
    });
  } catch (erro) {
    console.error("painel pagina:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro interno." });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
