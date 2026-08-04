/* =========================================================
   geo.js — baixa malhas do IBGE e grava JSON SVG em /geo
   Uso: npm run geo
   Sem dependências: Node 18+ (fetch nativo).
   ========================================================= */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DIR_CLIENTES = path.join(RAIZ, "clientes");
const DIR_GEO = path.join(RAIZ, "geo");

const LARGURA = 1000;
const PADDING = 24;
const TOLERANCIA = 0.35; // graus aproximados após projeção (ajustado após escala)
const MIN_ANEL = 8; // área mínima em unidades SVG² para manter o anel

const UF_POR_CODIGO = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF"
};

const NOME_UF = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins"
};

async function baixar(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

function coletarAnéis(geom) {
  if (!geom) return [];
  if (geom.type === "Polygon") return geom.coordinates;
  if (geom.type === "MultiPolygon") return geom.coordinates.flat();
  return [];
}

function bboxDeFeatures(features) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const f of features) {
    for (const anel of coletarAnéis(f.geometry)) {
      for (const [lon, lat] of anel) {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { minLon, minLat, maxLon, maxLat };
}

function simplificarAnel(anel, tolerancia) {
  if (anel.length <= 4) return anel;
  const out = [anel[0]];
  let [lx, ly] = anel[0];
  for (let i = 1; i < anel.length - 1; i++) {
    const [x, y] = anel[i];
    if (Math.hypot(x - lx, y - ly) >= tolerancia) {
      out.push(anel[i]);
      lx = x;
      ly = y;
    }
  }
  out.push(anel[anel.length - 1]);
  return out.length >= 4 ? out : anel;
}

function areaAnel(anel) {
  let a = 0;
  for (let i = 0; i < anel.length - 1; i++) {
    a += anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1];
  }
  return Math.abs(a / 2);
}

function projetarFeatures(features) {
  const bbox = bboxDeFeatures(features);
  const midLat = ((bbox.minLat + bbox.maxLat) / 2) * Math.PI / 180;
  const cosLat = Math.cos(midLat) || 1;

  const larguraGeo = (bbox.maxLon - bbox.minLon) * cosLat;
  const alturaGeo = bbox.maxLat - bbox.minLat;
  const util = LARGURA - PADDING * 2;
  const escala = util / Math.max(larguraGeo, alturaGeo || 1);
  const alturaSvg = Math.round(alturaGeo * escala + PADDING * 2);

  const tol = Math.max(0.8, (LARGURA / 1000) * 1.2);

  const areas = {};

  for (const f of features) {
    const props = f.properties || {};
    const aneis = coletarAnéis(f.geometry);
    const partes = [];

    for (const anel of aneis) {
      const projetado = anel.map(([lon, lat]) => {
        const x = (lon - bbox.minLon) * cosLat * escala + PADDING;
        const y = (bbox.maxLat - lat) * escala + PADDING;
        return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
      });

      const simples = simplificarAnel(projetado, tol);
      if (areaAnel(simples) < MIN_ANEL) continue;

      let d = "";
      for (let i = 0; i < simples.length; i++) {
        const [x, y] = simples[i];
        d += (i === 0 ? "M" : "L") + x + " " + y;
      }
      d += "Z";
      partes.push(d);
    }

    if (!partes.length) continue;

    const path = partes.join("");
    const cod = String(props.codarea || props.codigo || "");
    areas[cod] = { path, nome: props.nome || "" };
  }

  return {
    viewBox: `0 0 ${LARGURA} ${alturaSvg}`,
    areas
  };
}

function ufsMunicipaisDosClientes() {
  if (!fs.existsSync(DIR_CLIENTES)) return [];
  const ufs = new Set();

  for (const arq of fs.readdirSync(DIR_CLIENTES).filter((f) => f.endsWith(".json"))) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(DIR_CLIENTES, arq), "utf8"));
      // Todas as UFs usadas (inclui multi-estado para drill-down)
      if (Array.isArray(c.estados)) {
        for (const uf of c.estados) ufs.add(String(uf).toUpperCase());
      }
    } catch {
      /* ignora JSON inválido — o build avisa depois */
    }
  }

  return [...ufs].sort();
}

async function gerarBrasil() {
  console.log("  Baixando malha do Brasil (UF)…");
  const geojson = await baixar(
    "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=minima"
  );

  const projetado = projetarFeatures(geojson.features || []);
  const areas = {};

  for (const [cod, area] of Object.entries(projetado.areas)) {
    const uf = UF_POR_CODIGO[cod];
    if (!uf) continue;
    areas[uf] = {
      nome: NOME_UF[uf] || uf,
      path: area.path
    };
  }

  const saida = { viewBox: projetado.viewBox, areas };
  const destino = path.join(DIR_GEO, "brasil-uf.json");
  fs.writeFileSync(destino, JSON.stringify(saida));
  console.log(`  ✓ brasil-uf.json (${Object.keys(areas).length} UFs, ${Math.round(fs.statSync(destino).size / 1024)} KB)`);
}

async function gerarUf(uf) {
  console.log(`  Baixando malha municipal de ${uf}…`);
  const [geojson, municipios] = await Promise.all([
    baixar(
      `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${uf}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima`
    ),
    baixar(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
  ]);

  const nomes = {};
  for (const m of municipios) nomes[String(m.id)] = m.nome;

  const projetado = projetarFeatures(geojson.features || []);
  const areas = {};

  for (const [cod, area] of Object.entries(projetado.areas)) {
    areas[cod] = {
      nome: nomes[cod] || area.nome || cod,
      path: area.path
    };
  }

  const saida = { viewBox: projetado.viewBox, areas };
  const destino = path.join(DIR_GEO, `uf-${uf}.json`);
  fs.writeFileSync(destino, JSON.stringify(saida));
  console.log(`  ✓ uf-${uf}.json (${Object.keys(areas).length} municípios, ${Math.round(fs.statSync(destino).size / 1024)} KB)`);
}

async function main() {
  const inicio = Date.now();
  console.log("\n▸ Gerando mapas geo…\n");
  fs.mkdirSync(DIR_GEO, { recursive: true });

  await gerarBrasil();

  const ufs = ufsMunicipaisDosClientes();
  if (!ufs.length) {
    console.log("  Nenhuma UF nos clientes — pulando malhas municipais.");
  } else {
    console.log(`  UFs municipais: ${ufs.join(", ")}`);
    for (const uf of ufs) await gerarUf(uf);
  }

  console.log(`\n▸ Geo pronto em ${Date.now() - inicio}ms → /geo\n`);
}

main().catch((erro) => {
  console.error("\n✕ Falha no geo:", erro.message || erro);
  process.exit(1);
});
