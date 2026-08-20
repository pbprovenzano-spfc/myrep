/* =========================================================
   GET/PUT/POST /api/painel/pagina — editor self-service
   ========================================================= */

const { json, lerJsonBody } = require("../pagamento");
const { exigirUsuario } = require("../auth");
const { obterPaginaPorUserId } = require("../assinaturas");
const { getSupabase, supabaseConfigured } = require("../supabase");
const { situacaoDe } = require("../paginas");
const { normalizarDados, novoId, normalizarCidadesInput, reordenarPorIds } = require("../dados");
const {
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
} = require("../painel-helpers");

const CAMPOS_TEXTO = [
  "nome",
  "empresa",
  "cargo",
  "bio",
  "whatsapp",
  "mensagemWhatsapp",
  "segmentos",
  "paleta",
  "destaque",
  "fotoTipo"
];

function montarWhatsapp(ddd, numero) {
  const d = String(ddd || "").replace(/\D/g, "").slice(0, 2);
  const n = String(numero || "").replace(/\D/g, "").slice(0, 9);
  if (!d || !n) return "";
  return `55${d}${n}`;
}

async function salvarPagina(userId, dados, patchMeta = {}) {
  const sb = getSupabase();
  const normalizado = normalizarDados(dados);
  const update = {
    dados: normalizado,
    updated_at: new Date().toISOString(),
    ...patchMeta
  };
  const { data, error } = await sb
    .from("representantes")
    .update(update)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) {
    console.error("salvarPagina:", error.message);
    throw Object.assign(new Error("Falha ao salvar alterações."), { status: 500 });
  }
  return data;
}

module.exports = async function handler(req, res) {
  try {
    const { user } = await exigirUsuario(req);
    const pagina = await obterPaginaPorUserId(user.id);
    if (!pagina) {
      return json(res, 404, {
        erro: "Você ainda não escolheu sua URL. Defina o endereço da página primeiro."
      });
    }

    if (req.method === "GET") {
      const sit = situacaoDe({
        slug: pagina.slug,
        email_cobranca: pagina.email_cobranca,
        ativo: pagina.ativo !== false,
        inadimplente_desde: pagina.inadimplente_desde,
        controle_manual: pagina.controle_manual === true
      });
      return json(res, 200, {
        ok: true,
        pagina: {
          ...paginaResumo(pagina),
          situacao: sit.codigo,
          situacaoLabel: sit.label
        }
      });
    }

    if (req.method !== "PUT" && req.method !== "POST") {
      return json(res, 405, { erro: "Método não permitido" });
    }

    if (!supabaseConfigured()) {
      return json(res, 503, { erro: "Supabase não configurado." });
    }

    await exigirAssinaturaAtiva(user.id);

    const slug = pagina.slug;
    let dados = normalizarDados({
      ...(pagina.dados && typeof pagina.dados === "object" ? pagina.dados : {}),
      slug
    });
    let catalogos = [...dados.catalogos];
    let marcas = [...dados.marcas];
    let patchMeta = {};

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
        id: campo("id"),
        marcaId: campo("marcaId"),
        arquivoNome: campo("arquivo"),
        tipo: campo("tipo") || "PDF",
        fotoTipo: campo("fotoTipo") || "pessoa",
        ordem: campo("ordem")
      };
      arquivos = parts.filter((p) => p.filename && p.data && p.data.length);
    } else {
      const body = await lerJsonBody(req);
      acao = String(body.acao || "").trim();
      campos = body;
    }

    if (acao === "upload_url") {
      const tipo = String(campos.tipo || "catalogo").trim().toLowerCase();
      const original = String(campos.nome || campos.dica || "arquivo");
      const extBruta = (original.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const ext =
        extBruta || (tipo === "catalogo" ? "pdf" : tipo === "marca" || tipo === "foto" ? "jpg" : "bin");
      const dica = String(campos.dica || original.replace(/\.[^.]+$/, "") || tipo);
      let nomeArq;
      if (tipo === "foto") {
        nomeArq = `foto.${ext}`.slice(0, 120);
      } else if (tipo === "marca") {
        nomeArq = `marca-${nomeArquivoSeguro(dica, "marca")}.${ext}`.slice(0, 120);
      } else {
        nomeArq = `${nomeArquivoSeguro(dica, "catalogo")}-${Date.now().toString(36)}.${ext}`.slice(
          0,
          120
        );
      }
      const up = await criarUrlUpload(slug, nomeArq, { upsert: tipo === "foto" || tipo === "marca" });
      return json(res, 200, { ok: true, ...up });
    } else if (acao === "atualizar" || req.method === "PUT") {
      for (const k of CAMPOS_TEXTO) {
        if (campos[k] !== undefined) dados[k] = campos[k];
      }
      if (campos.estados !== undefined) {
        dados.estados = Array.isArray(campos.estados)
          ? campos.estados.map((u) => String(u).toUpperCase())
          : [];
      }
      if (campos.cidades !== undefined) {
        dados.cidades = normalizarCidadesInput(campos.cidades, dados.estados || []);
      }
      if (campos.contatos !== undefined && Array.isArray(campos.contatos)) {
        dados.contatos = campos.contatos;
      }
      dados = normalizarDados({ ...dados, catalogos, marcas });
    } else if (acao === "foto_set") {
      const file = arquivos[0];
      let nomeArq = nomeAssetInformado(campos.arquivo);
      if (file) {
        if (file.data.length > MAX_ANEXO) return json(res, 413, { erro: "Arquivo grande demais." });
        const ext = (file.filename.split(".").pop() || "jpg").toLowerCase();
        nomeArq = `foto.${ext}`.slice(0, 120);
        if (dados.foto && dados.foto !== nomeArq) await removerAsset(slug, dados.foto);
        await uploadAsset(slug, nomeArq, file.data, mimePorNome(nomeArq));
      }
      if (!nomeArq) return json(res, 400, { erro: "Envie a foto ou logo." });
      if (dados.foto && dados.foto !== nomeArq) await removerAsset(slug, dados.foto);
      dados.foto = nomeArq;
      dados.fotoTipo = campos.fotoTipo === "logo" ? "logo" : "pessoa";
    } else if (acao === "marca_add" || acao === "marca_editar") {
      const nomeMarca = String(campos.nome || "").trim().slice(0, 120);
      if (!nomeMarca) return json(res, 400, { erro: "Informe o nome da marca." });
      const file = arquivos[0];
      let logo = nomeAssetInformado(campos.arquivo) || null;
      if (file) {
        if (file.data.length > MAX_ANEXO) return json(res, 413, { erro: "Arquivo grande demais." });
        const ext = (file.filename.split(".").pop() || "png").toLowerCase();
        logo = `marca-${nomeArquivoSeguro(nomeMarca, "marca")}.${ext}`.slice(0, 120);
        await uploadAsset(slug, logo, file.data, mimePorNome(logo));
      }
      const idAlvo = campos.id || null;
      const idx = idAlvo
        ? marcas.findIndex((m) => m.id === idAlvo)
        : marcas.findIndex((m) => String(m.nome || "").toLowerCase() === nomeMarca.toLowerCase());
      const entrada = {
        id: idx >= 0 ? marcas[idx].id : novoId("m"),
        nome: nomeMarca,
        ...(logo ? { logo } : idx >= 0 && marcas[idx].logo ? { logo: marcas[idx].logo } : {})
      };
      if (idx >= 0) marcas[idx] = entrada;
      else marcas.push(entrada);
    } else if (acao === "marca_remover") {
      const idAlvo = campos.id || campos.marcaId;
      const nomeMarca = String(campos.nome || "").trim().toLowerCase();
      const item = idAlvo
        ? marcas.find((m) => m.id === idAlvo)
        : marcas.find((m) => String(m.nome || "").toLowerCase() === nomeMarca);
      if (item?.logo) await removerAsset(slug, item.logo);
      marcas = marcas.filter((m) => m !== item);
      catalogos = catalogos.map((c) => (c.marcaId === item?.id ? { ...c, marcaId: undefined } : c));
    } else if (acao === "catalogo_add") {
      const file = arquivos[0];
      let nomeArq = nomeAssetInformado(campos.arquivo);
      if (file) {
        if (file.data.length > MAX_ANEXO) return json(res, 413, { erro: "Arquivo grande demais (máx. 3,5 MB por este caminho). Envie pelo painel atualizado." });
        const ext = (file.filename.split(".").pop() || "pdf").toLowerCase();
        const base = nomeArquivoSeguro(campos.titulo || file.filename.replace(/\.[^.]+$/, ""), "catalogo");
        nomeArq = `${base}.${ext}`.slice(0, 120);
        await uploadAsset(slug, nomeArq, file.data, mimePorNome(nomeArq));
      }
      if (!nomeArq) return json(res, 400, { erro: "Envie o arquivo do catálogo." });
      const ext = (nomeArq.split(".").pop() || "pdf").toLowerCase();
      const cat = {
        id: novoId("c"),
        titulo: (campos.titulo || nomeArq.replace(/\.[^.]+$/, "")).slice(0, 120),
        arquivo: nomeArq,
        tipo: campos.tipo || (ext === "pdf" ? "PDF" : "Arquivo")
      };
      if (campos.marcaId) cat.marcaId = campos.marcaId;
      catalogos.push(cat);
    } else if (acao === "catalogo_editar") {
      const idAlvo = campos.id;
      const idx = catalogos.findIndex((c) => c.id === idAlvo || c.arquivo === campos.arquivoNome);
      if (idx < 0) return json(res, 404, { erro: "Catálogo não encontrado." });
      const cat = { ...catalogos[idx] };
      if (campos.titulo) cat.titulo = String(campos.titulo).slice(0, 120);
      if (campos.marcaId !== undefined) {
        if (campos.marcaId) cat.marcaId = campos.marcaId;
        else delete cat.marcaId;
      }
      const file = arquivos[0];
      if (file) {
        if (file.data.length > MAX_ANEXO) return json(res, 413, { erro: "Arquivo grande demais." });
        if (cat.arquivo) await removerAsset(slug, cat.arquivo);
        const ext = (file.filename.split(".").pop() || "pdf").toLowerCase();
        const base = nomeArquivoSeguro(campos.titulo || cat.titulo || "catalogo", "catalogo");
        const nomeArq = `${base}.${ext}`.slice(0, 120);
        await uploadAsset(slug, nomeArq, file.data, mimePorNome(nomeArq));
        cat.arquivo = nomeArq;
      }
      catalogos[idx] = cat;
    } else if (acao === "catalogo_remover") {
      const alvo = String(campos.id || campos.arquivoNome || campos.arquivo || "").trim();
      const item = catalogos.find((c) => c.id === alvo || c.arquivo === alvo || c.titulo === alvo);
      if (item?.arquivo) await removerAsset(slug, item.arquivo);
      catalogos = catalogos.filter((c) => c !== item);
    } else if (acao === "catalogo_reordenar") {
      const ordem = Array.isArray(campos.ordem) ? campos.ordem : JSON.parse(campos.ordem || "[]");
      catalogos = reordenarPorIds(catalogos, ordem);
    } else if (acao === "marca_reordenar") {
      const ordem = Array.isArray(campos.ordem) ? campos.ordem : JSON.parse(campos.ordem || "[]");
      marcas = reordenarPorIds(marcas, ordem);
    } else if (acao === "publicar") {
      if (!dados.nome && !dados.empresa) {
        return json(res, 400, { erro: "Preencha pelo menos o nome antes de publicar." });
      }
      patchMeta = { publicado: true, publicado_em: new Date().toISOString() };
    } else if (acao === "despublicar") {
      patchMeta = { publicado: false };
    } else if (acao !== "atualizar" && req.method === "POST") {
      return json(res, 400, { erro: "Ação inválida." });
    }

    dados = normalizarDados({ ...dados, catalogos, marcas });
    const data = await salvarPagina(user.id, dados, patchMeta);

    return json(res, 200, {
      ok: true,
      pagina: paginaResumo(data),
      aviso: patchMeta.publicado ? "Página publicada e no ar." : "Alterações salvas."
    });
  } catch (erro) {
    console.error("painel pagina:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro interno." });
  }
};

module.exports.config = {
  api: { bodyParser: false }
};
