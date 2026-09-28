/* =========================================================
   GET/PUT/POST /api/painel/pagina — editor self-service
   ========================================================= */

const { json, lerJsonBody } = require("../pagamento");
const { exigirUsuario } = require("../auth");
const { obterPaginaPorUserId } = require("../assinaturas");
const { getSupabase, supabaseConfigured } = require("../supabase");
const { situacaoDe } = require("../paginas");
const {
  normalizarDados,
  novoId,
  normalizarCidadesInput,
  reordenarPorIds,
  normalizarSite,
  normalizarContatoMarca
} = require("../dados");
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
  mimePorNome,
  extensaoImagemPermitida,
  extensaoDeNome
} = require("../painel-helpers");

const MAX_SAVE_RETRIES = 5;

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

function aplicarCamposTexto(dados, campos) {
  const out = { ...dados };
  for (const k of CAMPOS_TEXTO) {
    if (campos[k] !== undefined) out[k] = campos[k];
  }
  if (campos.estados !== undefined) {
    out.estados = Array.isArray(campos.estados)
      ? campos.estados.map((u) => String(u).toUpperCase())
      : [];
  }
  if (campos.cidades !== undefined) {
    out.cidades = normalizarCidadesInput(campos.cidades, out.estados || []);
  }
  if (campos.contatos !== undefined && Array.isArray(campos.contatos)) {
    out.contatos = campos.contatos;
  }
  return out;
}

async function salvarPaginaOtimista(userId, slug, mutator, patchMeta = {}, beforeAttempt = null) {
  const sb = getSupabase();
  for (let attempt = 0; attempt < MAX_SAVE_RETRIES; attempt++) {
    const { data: row, error: readErr } = await sb
      .from("representantes")
      .select("dados, updated_at, slug")
      .eq("user_id", userId)
      .single();
    if (readErr || !row) {
      console.error("salvarPaginaOtimista read:", readErr?.message);
      throw Object.assign(new Error("Falha ao carregar a página."), { status: 500 });
    }
    const expectedAt = row.updated_at;
    const slugAtual = row.slug || slug;
    let dados = normalizarDados({
      ...(row.dados && typeof row.dados === "object" ? row.dados : {}),
      slug: slugAtual
    });
    if (beforeAttempt) await beforeAttempt(dados, slugAtual);
    dados = mutator(dados);
    const normalizado = normalizarDados(dados);
    const update = {
      dados: normalizado,
      updated_at: new Date().toISOString(),
      ...patchMeta
    };
    const { data, error: upErr } = await sb
      .from("representantes")
      .update(update)
      .eq("user_id", userId)
      .eq("updated_at", expectedAt)
      .select()
      .single();
    if (!upErr && data) return data;
    if (upErr && upErr.code !== "PGRST116") {
      console.error("salvarPaginaOtimista:", upErr.message);
      throw Object.assign(new Error("Falha ao salvar alterações."), { status: 500 });
    }
  }
  throw Object.assign(new Error("Não foi possível salvar agora. Tente de novo."), { status: 409 });
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
    let patchMeta = {};
    let mutator = null;
    let beforeAttempt = null;

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
      if ((tipo === "foto" || tipo === "marca") && !extensaoImagemPermitida(original)) {
        return json(res, 400, { erro: "Use JPG, PNG ou WEBP." });
      }
      const extBruta = extensaoDeNome(original);
      const ext =
        extBruta || (tipo === "catalogo" ? "pdf" : tipo === "marca" || tipo === "foto" ? "jpg" : "bin");
      if ((tipo === "foto" || tipo === "marca") && !extensaoImagemPermitida(`x.${ext}`)) {
        return json(res, 400, { erro: "Use JPG, PNG ou WEBP." });
      }
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
      mutator = (dados) => aplicarCamposTexto(dados, campos);
    } else if (acao === "foto_set") {
      const file = arquivos[0];
      let nomeArq = nomeAssetInformado(campos.arquivo);
      if (file) {
        if (file.data.length > MAX_ANEXO) return json(res, 413, { erro: "Arquivo grande demais." });
        if (!extensaoImagemPermitida(file.filename)) {
          return json(res, 400, { erro: "Use JPG, PNG ou WEBP." });
        }
        const ext = extensaoDeNome(file.filename) || "jpg";
        nomeArq = `foto.${ext}`.slice(0, 120);
        await uploadAsset(slug, nomeArq, file.data, mimePorNome(nomeArq));
      }
      if (!nomeArq) return json(res, 400, { erro: "Envie a foto ou logo." });
      if (!extensaoImagemPermitida(nomeArq)) {
        return json(res, 400, { erro: "Use JPG, PNG ou WEBP." });
      }
      const fotoTipo = campos.fotoTipo === "logo" ? "logo" : "pessoa";
      beforeAttempt = async (dados, slugAtual) => {
        if (dados.foto && dados.foto !== nomeArq) await removerAsset(slugAtual, dados.foto);
      };
      mutator = (dados) => ({ ...dados, foto: nomeArq, fotoTipo });
    } else if (acao === "marca_add" || acao === "marca_editar") {
      const nomeMarca = String(campos.nome || "").trim().slice(0, 120);
      if (!nomeMarca) return json(res, 400, { erro: "Informe o nome da marca." });
      const file = arquivos[0];
      let logo = nomeAssetInformado(campos.arquivo) || null;
      if (file) {
        if (file.data.length > MAX_ANEXO) return json(res, 413, { erro: "Arquivo grande demais." });
        if (!extensaoImagemPermitida(file.filename)) {
          return json(res, 400, { erro: "Use JPG, PNG ou WEBP." });
        }
        const ext = extensaoDeNome(file.filename) || "png";
        logo = `marca-${nomeArquivoSeguro(nomeMarca, "marca")}.${ext}`.slice(0, 120);
        await uploadAsset(slug, logo, file.data, mimePorNome(logo));
      }
      if (logo && !extensaoImagemPermitida(logo)) {
        return json(res, 400, { erro: "Use JPG, PNG ou WEBP." });
      }
      const idAlvo = campos.id || null;
      const descricao = String(campos.descricao || "").trim().slice(0, 600);
      const site = normalizarSite(campos.site);
      const contatoCanal = String(campos.contatoCanal || "").trim().slice(0, 80);
      const contatoValor = String(campos.contatoValor || "").trim().slice(0, 160);
      let contatoExtra = null;
      if (contatoCanal && contatoValor) {
        contatoExtra = normalizarContatoMarca({ canal: contatoCanal, valor: contatoValor });
      }
      const limparContato = !contatoCanal && !contatoValor;
      mutator = (dados) => {
        const marcas = [...(dados.marcas || [])];
        const idx = idAlvo
          ? marcas.findIndex((m) => m.id === idAlvo)
          : marcas.findIndex((m) => String(m.nome || "").toLowerCase() === nomeMarca.toLowerCase());
        const existente = idx >= 0 ? marcas[idx] : null;
        const entrada = {
          id: existente?.id || novoId("m"),
          nome: nomeMarca,
          ...(logo ? { logo } : existente?.logo ? { logo: existente.logo } : {})
        };
        if (descricao) entrada.descricao = descricao;
        if (site) entrada.site = site;
        if (contatoExtra) entrada.contato = contatoExtra;
        else if (limparContato && existente?.contato) delete entrada.contato;
        if (idx >= 0) marcas[idx] = entrada;
        else marcas.push(entrada);
        return { ...dados, marcas };
      };
    } else if (acao === "marca_remover") {
      const idAlvo = campos.id || campos.marcaId;
      const nomeMarca = String(campos.nome || "").trim().toLowerCase();
      beforeAttempt = async (dados, slugAtual) => {
        const marcas = dados.marcas || [];
        const item = idAlvo
          ? marcas.find((m) => m.id === idAlvo)
          : marcas.find((m) => String(m.nome || "").toLowerCase() === nomeMarca);
        if (item?.logo) await removerAsset(slugAtual, item.logo);
      };
      mutator = (dados) => {
        const marcas = dados.marcas || [];
        const item = idAlvo
          ? marcas.find((m) => m.id === idAlvo)
          : marcas.find((m) => String(m.nome || "").toLowerCase() === nomeMarca);
        const marcasFiltradas = marcas.filter((m) => m !== item);
        const catalogos = (dados.catalogos || []).map((c) =>
          c.marcaId === item?.id ? { ...c, marcaId: undefined } : c
        );
        return { ...dados, marcas: marcasFiltradas, catalogos };
      };
    } else if (acao === "catalogo_add") {
      const file = arquivos[0];
      let nomeArq = nomeAssetInformado(campos.arquivo);
      if (file) {
        if (file.data.length > MAX_ANEXO) {
          return json(res, 413, {
            erro: "Arquivo grande demais (máx. 3,5 MB por este caminho). Envie pelo painel atualizado."
          });
        }
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
      mutator = (dados) => ({
        ...dados,
        catalogos: [...(dados.catalogos || []), cat]
      });
    } else if (acao === "catalogo_editar") {
      const idAlvo = campos.id;
      const file = arquivos[0];
      if (file && file.data.length > MAX_ANEXO) {
        return json(res, 413, { erro: "Arquivo grande demais." });
      }
      let novoArquivo = null;
      let storagePronto = !file;
      if (file) {
        beforeAttempt = async (dados, slugAtual) => {
          if (storagePronto) return;
          const cat = (dados.catalogos || []).find(
            (c) => c.id === idAlvo || c.arquivo === campos.arquivoNome
          );
          if (!cat) {
            throw Object.assign(new Error("Catálogo não encontrado."), { status: 404 });
          }
          if (cat.arquivo) await removerAsset(slugAtual, cat.arquivo);
          const ext = (file.filename.split(".").pop() || "pdf").toLowerCase();
          const base = nomeArquivoSeguro(campos.titulo || cat.titulo || "catalogo", "catalogo");
          novoArquivo = `${base}.${ext}`.slice(0, 120);
          await uploadAsset(slugAtual, novoArquivo, file.data, mimePorNome(novoArquivo));
          storagePronto = true;
        };
      }
      mutator = (dados) => {
        const catalogos = [...(dados.catalogos || [])];
        const idx = catalogos.findIndex((c) => c.id === idAlvo || c.arquivo === campos.arquivoNome);
        if (idx < 0) {
          throw Object.assign(new Error("Catálogo não encontrado."), { status: 404 });
        }
        const cat = { ...catalogos[idx] };
        if (campos.titulo) cat.titulo = String(campos.titulo).slice(0, 120);
        if (campos.marcaId !== undefined) {
          if (campos.marcaId) cat.marcaId = campos.marcaId;
          else delete cat.marcaId;
        }
        if (novoArquivo) cat.arquivo = novoArquivo;
        catalogos[idx] = cat;
        return { ...dados, catalogos };
      };
    } else if (acao === "catalogo_remover") {
      const alvo = String(campos.id || campos.arquivoNome || campos.arquivo || "").trim();
      beforeAttempt = async (dados, slugAtual) => {
        const item = (dados.catalogos || []).find(
          (c) => c.id === alvo || c.arquivo === alvo || c.titulo === alvo
        );
        if (item?.arquivo) await removerAsset(slugAtual, item.arquivo);
      };
      mutator = (dados) => ({
        ...dados,
        catalogos: (dados.catalogos || []).filter(
          (c) => c.id !== alvo && c.arquivo !== alvo && c.titulo !== alvo
        )
      });
    } else if (acao === "catalogo_reordenar") {
      const ordem = Array.isArray(campos.ordem) ? campos.ordem : JSON.parse(campos.ordem || "[]");
      mutator = (dados) => ({
        ...dados,
        catalogos: reordenarPorIds(dados.catalogos || [], ordem)
      });
    } else if (acao === "marca_reordenar") {
      const ordem = Array.isArray(campos.ordem) ? campos.ordem : JSON.parse(campos.ordem || "[]");
      mutator = (dados) => ({
        ...dados,
        marcas: reordenarPorIds(dados.marcas || [], ordem)
      });
    } else if (acao === "publicar") {
      mutator = (dados) => {
        if (!dados.nome && !dados.empresa) {
          throw Object.assign(new Error("Preencha pelo menos o nome antes de publicar."), { status: 400 });
        }
        return dados;
      };
      patchMeta = { publicado: true, publicado_em: new Date().toISOString() };
    } else if (acao === "despublicar") {
      mutator = (dados) => dados;
      patchMeta = { publicado: false };
    } else if (acao !== "atualizar" && req.method === "POST") {
      return json(res, 400, { erro: "Ação inválida." });
    }

    if (!mutator) {
      return json(res, 400, { erro: "Ação inválida." });
    }

    const data = await salvarPaginaOtimista(user.id, slug, mutator, patchMeta, beforeAttempt);

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
