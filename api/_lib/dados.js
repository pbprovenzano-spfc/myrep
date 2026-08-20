/* =========================================================
   Normalização de representantes.dados (marcas, catálogos, contatos)
   ========================================================= */

const crypto = require("crypto");

function novoId(prefixo) {
  return `${prefixo}_${crypto.randomBytes(4).toString("hex")}`;
}

function normalizarMarcas(marcas) {
  if (!Array.isArray(marcas)) return [];
  return marcas
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      const nome = String(m.nome || "").trim().slice(0, 120);
      if (!nome) return null;
      return {
        id: m.id || novoId("m"),
        nome,
        ...(m.logo ? { logo: String(m.logo).slice(0, 120) } : {})
      };
    })
    .filter(Boolean);
}

function normalizarCatalogos(catalogos, marcas) {
  if (!Array.isArray(catalogos)) return [];
  const porLogo = new Map();
  for (const m of marcas) {
    if (m.logo) porLogo.set(m.logo, m.id);
  }

  return catalogos
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const titulo = String(c.titulo || "Catálogo").trim().slice(0, 120);
      const arquivo = String(c.arquivo || "").trim().slice(0, 120);
      if (!arquivo) return null;
      let marcaId = c.marcaId || null;
      if (!marcaId && c.logo && porLogo.has(c.logo)) {
        marcaId = porLogo.get(c.logo);
      }
      const out = {
        id: c.id || novoId("c"),
        titulo,
        arquivo,
        tipo: String(c.tipo || "PDF").slice(0, 40)
      };
      if (marcaId) out.marcaId = marcaId;
      return out;
    })
    .filter(Boolean);
}

function normalizarContatos(contatos) {
  if (!Array.isArray(contatos)) return [];
  return contatos
    .map((ct) => {
      if (!ct || typeof ct !== "object") return null;
      const canal = String(ct.canal || "").trim().slice(0, 80);
      const valor = String(ct.valor || "").trim().slice(0, 160);
      const link = String(ct.link || "#").trim().slice(0, 500);
      if (!canal || !valor) return null;
      return { canal, valor, link };
    })
    .filter(Boolean);
}

function normalizarCidadesInput(cidades, estados) {
  const ufs = Array.isArray(estados) ? estados.map((u) => String(u).toUpperCase()) : [];
  const porUf = {};
  for (const uf of ufs) porUf[uf] = [];

  if (Array.isArray(cidades)) {
    if (ufs.length === 1) {
      porUf[ufs[0]] = cidades.map((c) => String(c).trim()).filter(Boolean);
    }
    return porUf;
  }

  if (cidades && typeof cidades === "object") {
    for (const [uf, lista] of Object.entries(cidades)) {
      const chave = String(uf).toUpperCase();
      if (!porUf[chave]) continue;
      porUf[chave] = Array.isArray(lista) ? lista.map((c) => String(c).trim()).filter(Boolean) : [];
    }
  }
  return porUf;
}

function normalizarDados(dados = {}) {
  const base = dados && typeof dados === "object" ? { ...dados } : {};
  const marcas = normalizarMarcas(base.marcas);
  const catalogos = normalizarCatalogos(base.catalogos, marcas);
  const contatos = normalizarContatos(base.contatos);
  const estados = Array.isArray(base.estados)
    ? [...new Set(base.estados.map((u) => String(u).toUpperCase()).filter(Boolean))]
    : [];
  const cidades = normalizarCidadesInput(base.cidades, estados);

  return {
    ...base,
    marcas,
    catalogos,
    contatos,
    estados,
    cidades: estados.length <= 1 && Array.isArray(base.cidades) ? base.cidades : cidades
  };
}

function reordenarPorIds(itens, ordem) {
  if (!Array.isArray(itens)) return [];
  const mapa = new Map(itens.map((item) => [item.id, item]));
  const vistos = new Set();
  const resultado = [];
  const ids = Array.isArray(ordem) ? ordem : [];
  for (const id of ids) {
    const item = mapa.get(id);
    if (item && !vistos.has(item.id)) {
      resultado.push(item);
      vistos.add(item.id);
    }
  }
  for (const item of itens) {
    if (!vistos.has(item.id)) resultado.push(item);
  }
  return resultado;
}

function agruparCatalogos(catalogos, marcas) {
  const marcasLista = Array.isArray(marcas) ? marcas : [];
  const idsMarcas = new Set(marcasLista.map((m) => m.id));
  const porMarca = new Map();
  const outros = [];

  for (const cat of Array.isArray(catalogos) ? catalogos : []) {
    if (cat.marcaId && idsMarcas.has(cat.marcaId)) {
      if (!porMarca.has(cat.marcaId)) porMarca.set(cat.marcaId, []);
      porMarca.get(cat.marcaId).push(cat);
    } else {
      outros.push(cat);
    }
  }

  const grupos = [];
  for (const marca of marcasLista) {
    const lista = porMarca.get(marca.id);
    if (lista && lista.length) grupos.push({ tipo: "marca", marca, catalogos: lista });
  }
  if (outros.length) grupos.push({ tipo: "outros", marca: null, catalogos: outros });
  return grupos;
}

module.exports = {
  novoId,
  normalizarMarcas,
  normalizarCatalogos,
  normalizarContatos,
  normalizarCidadesInput,
  normalizarDados,
  reordenarPorIds,
  agruparCatalogos
};
