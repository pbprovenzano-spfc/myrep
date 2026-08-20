/* =========================================================
   Mapa de atuação — renderização client-side + drill-down Brasil → UF
   ========================================================= */

(function () {
  "use strict";

  const NOME_UF = {
    AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
    CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
    MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
    PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
    RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
    RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
    SE: "Sergipe", TO: "Tocantins"
  };

  const cache = new Map();
  let glowSeq = 0;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizar(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function temItens(a) {
    return Array.isArray(a) && a.length > 0;
  }

  async function fetchGeo(arquivo) {
    if (cache.has(arquivo)) return cache.get(arquivo);
    const resp = await fetch(`/geo/${arquivo}`);
    if (!resp.ok) throw new Error(`Geo ${arquivo} indisponível`);
    const data = await resp.json();
    cache.set(arquivo, data);
    return data;
  }

  function pontosDoPath(d) {
    const pts = [];
    const re = /[ML]\s*([-\d.]+)\s+([-\d.]+)/g;
    let m;
    while ((m = re.exec(d))) pts.push([Number(m[1]), Number(m[2])]);
    return pts;
  }

  function centroidePath(d) {
    const pts = pontosDoPath(d);
    if (!pts.length) return null;
    let x = 0;
    let y = 0;
    for (const [px, py] of pts) {
      x += px;
      y += py;
    }
    return [Math.round((x / pts.length) * 10) / 10, Math.round((y / pts.length) * 10) / 10];
  }

  function pinSvg(x, y, escala) {
    const s = escala == null ? 1 : escala;
    return `<g class="mapa__pin" transform="translate(${x} ${y}) scale(${s})" aria-hidden="true">
        <path class="mapa__pin-corpo" d="M0 0C0 0-11-14-11-22C-11-28-6-33 0-33C6-33 11-28 11-22C11-14 0 0 0 0Z"/>
        <circle class="mapa__pin-olho" cx="0" cy="-22" r="4.2"/>
      </g>`;
  }

  function montarSvgMapa(mapa, ativas, titulo, { clicavel = false, glow = "#F0A202" } = {}) {
    const totalAreas = Object.keys(mapa.areas).length;
    const pintarTudo = ativas.size > 0 && ativas.size === totalAreas;
    const glowId = "mapa-glow-" + ++glowSeq;
    const corGlow = esc(glow);

    const paths = Object.entries(mapa.areas)
      .map(([id, area]) => {
        const isAtiva = ativas.has(id);
        const cls = isAtiva ? " mapa__area--ativa" : "";
        const dataUf = clicavel && isAtiva ? ` data-uf="${esc(id)}"` : "";
        const foco =
          clicavel && isAtiva
            ? ` tabindex="0" role="button" aria-label="${esc(NOME_UF[id] || id)}"`
            : ' aria-hidden="true"';
        return `<path class="mapa__area${cls}" d="${area.path}" data-id="${esc(id)}"${dataUf}${foco}></path>`;
      })
      .join("\n");

    const pinEscala = clicavel ? 1.15 : ativas.size > 8 ? 0.7 : ativas.size > 3 ? 0.9 : 1.05;

    let pins = "";
    if (pintarTudo && !clicavel) {
      const todosPts = [];
      for (const id of ativas) {
        const area = mapa.areas[id];
        if (area) todosPts.push(...pontosDoPath(area.path));
      }
      if (todosPts.length) {
        let x = 0;
        let y = 0;
        for (const [px, py] of todosPts) {
          x += px;
          y += py;
        }
        pins = pinSvg(
          Math.round((x / todosPts.length) * 10) / 10,
          Math.round((y / todosPts.length) * 10) / 10,
          1.25
        );
      }
    } else {
      pins = [...ativas]
        .map((id) => {
          const area = mapa.areas[id];
          if (!area) return "";
          const c = centroidePath(area.path);
          if (!c) return "";
          return pinSvg(c[0], c[1], pinEscala);
        })
        .filter(Boolean)
        .join("\n");
    }

    return `<div class="mapa-wrap">
        <svg class="mapa" viewBox="${esc(mapa.viewBox)}" role="img" aria-label="${esc(titulo)}">
          <title>${esc(titulo)}</title>
          <defs>
            <filter id="${glowId}" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="${corGlow}" flood-opacity="0.55"/>
              <feDropShadow dx="0" dy="0" stdDeviation="22" flood-color="${corGlow}" flood-opacity="0.28"/>
            </filter>
          </defs>
          <g class="mapa__silhueta" filter="url(#${glowId})">
${paths}
          </g>
          <g class="mapa__pins">
${pins}
          </g>
        </svg>
      </div>`;
  }

  function legendaEscrita(itens) {
    const lis = itens.map((nome) => `<li>${esc(nome)}</li>`).join("\n");
    return `<div class="mapa__chave" aria-hidden="true">
        <span class="mapa__chave-pin" aria-hidden="true"></span>
        Área atendida
      </div>
      <ul class="mapa__legenda">
${lis}
      </ul>`;
  }

  function fallbackUfs(estados) {
    return `<ul class="ufs">${estados.map((uf) => `<li>${esc(uf)}</li>`).join("")}</ul>`;
  }

  function resolverEstado(mapa, uf, cidades, glow) {
    if (!mapa) {
      return { html: fallbackUfs([uf]), legenda: [NOME_UF[uf] || uf] };
    }

    const porNome = new Map();
    for (const [id, area] of Object.entries(mapa.areas)) {
      porNome.set(normalizar(area.nome), { id, nome: area.nome });
    }

    let ativas = new Set();
    let legenda = [];

    if (temItens(cidades)) {
      for (const cidade of cidades) {
        const hit = porNome.get(normalizar(cidade));
        if (!hit) continue;
        ativas.add(hit.id);
        legenda.push(hit.nome);
      }
      if (!ativas.size) {
        ativas = new Set(Object.keys(mapa.areas));
        legenda = [NOME_UF[uf] || uf];
      }
    } else {
      ativas = new Set(Object.keys(mapa.areas));
      legenda = [NOME_UF[uf] || uf];
    }

    const titulo = `Mapa de ${NOME_UF[uf] || uf} — municípios atendidos`;
    return {
      html: montarSvgMapa(mapa, ativas, titulo, { glow }),
      legenda
    };
  }

  async function painelBrasil(estados, glow) {
    let mapa;
    try {
      mapa = await fetchGeo("brasil-uf.json");
    } catch {
      return `<div class="mapa-painel" data-vista="brasil">
${fallbackUfs(estados)}
${legendaEscrita(estados.map((uf) => NOME_UF[uf] || uf))}
    </div>`;
    }

    const ativas = new Set(estados);
    const legenda = estados.map((uf) => NOME_UF[uf] || uf);
    const titulo = "Mapa do Brasil — clique em um estado atendido";

    return `<div class="mapa-painel mapa-painel--brasil" data-vista="brasil">
      <p class="mapa__dica">Clique em um estado para ver as cidades</p>
${montarSvgMapa(mapa, ativas, titulo, { clicavel: true, glow })}
${legendaEscrita(legenda)}
    </div>`;
  }

  async function painelUf(uf, cidades, glow, oculto) {
    let mapa = null;
    try {
      mapa = await fetchGeo(`uf-${uf}.json`);
    } catch {
      /* fallback abaixo */
    }
    const resultado = resolverEstado(mapa, uf, cidades, glow);
    const hidden = oculto ? " hidden" : "";
    return `<div class="mapa-painel mapa-painel--uf" data-vista="${esc(uf)}"${hidden}>
      <p class="mapa__dica">${esc(NOME_UF[uf] || uf)}</p>
${resultado.html}
${legendaEscrita(resultado.legenda)}
    </div>`;
  }

  async function montarMapa(mount, estados, cidadesPorUf, glow) {
    if (!temItens(estados)) {
      mount.innerHTML = "";
      mount.removeAttribute("aria-busy");
      return;
    }

    let html = "";
    if (estados.length === 1) {
      html = await painelUf(estados[0], cidadesPorUf[estados[0]] || [], glow, false);
    } else {
      const brasil = await painelBrasil(estados, glow);
      const ufs = await Promise.all(
        estados.map((uf) => painelUf(uf, cidadesPorUf[uf] || [], glow, true))
      );
      html = `${brasil}
${ufs.join("\n")}
    <button type="button" class="mapa__voltar" hidden>← Estados</button>`;
    }

    mount.innerHTML = html;
    mount.removeAttribute("aria-busy");
  }

  function ativarDrill(bloco) {
    const painelBrasil = bloco.querySelector('[data-vista="brasil"]');
    const paineisUf = Array.from(bloco.querySelectorAll(".mapa-painel--uf"));
    const voltar = bloco.querySelector(".mapa__voltar");
    if (!painelBrasil || !paineisUf.length) return;

    function mostrar(vista) {
      const ehBrasil = vista === "brasil";
      painelBrasil.hidden = !ehBrasil;
      for (const p of paineisUf) p.hidden = p.getAttribute("data-vista") !== vista;
      if (voltar) {
        voltar.hidden = ehBrasil;
        if (!ehBrasil) voltar.focus({ preventScroll: true });
      }
    }

    function abrirUf(uf) {
      if (!uf) return;
      const existe = paineisUf.some((p) => p.getAttribute("data-vista") === uf);
      if (!existe) return;
      mostrar(uf);
    }

    painelBrasil.addEventListener("click", (ev) => {
      const path = ev.target.closest("path.mapa__area--ativa[data-uf]");
      if (!path) return;
      abrirUf(path.getAttribute("data-uf"));
    });

    painelBrasil.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const path = ev.target.closest("path.mapa__area--ativa[data-uf]");
      if (!path) return;
      ev.preventDefault();
      abrirUf(path.getAttribute("data-uf"));
    });

    if (voltar) {
      voltar.addEventListener("click", () => mostrar("brasil"));
    }
  }

  async function initMount(bloco) {
    const mount = bloco.querySelector(".mapa-mount");
    if (!mount) return;

    let estados = [];
    let cidades = {};
    try {
      estados = JSON.parse(bloco.getAttribute("data-estados") || "[]");
      cidades = JSON.parse(bloco.getAttribute("data-cidades") || "{}");
    } catch {
      mount.textContent = "Mapa indisponível.";
      return;
    }

    const glow = bloco.getAttribute("data-glow") || "#F0A202";
    await montarMapa(mount, estados, cidades, glow);

    if (bloco.getAttribute("data-mapa") === "drill") {
      ativarDrill(bloco);
    }
  }

  function montarNos(raiz) {
    const root = raiz && raiz.querySelectorAll ? raiz : document;
    const blocos = [];
    if (root.matches && root.matches("[data-mapa-mount]")) blocos.push(root);
    if (root.querySelectorAll) blocos.push(...root.querySelectorAll("[data-mapa-mount]"));
    blocos.forEach((bloco) => {
      initMount(bloco).catch(() => {
        const mount = bloco.querySelector(".mapa-mount");
        if (mount) mount.textContent = "Não foi possível carregar o mapa.";
      });
    });
  }

  montarNos(document);

  window.MyRepMapa = { fetchGeo, NOME_UF, normalizar, montarNos };
})();
