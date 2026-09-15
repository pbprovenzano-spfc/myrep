/* =========================================================
   painel.js — editor self-service do representante
   ========================================================= */

(function () {
  const UFS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
    "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
  ];

  const carregando = document.getElementById("painel-carregando");
  const conteudo = document.getElementById("painel-conteudo");
  const btnSair = document.getElementById("btn-sair");

  const PALETAS_PREVIEW = {
    ambar: {
      "--ink": "#0A1620",
      "--ink-soft": "#1A3040",
      "--papel": "#F2F5F7",
      "--sinal": "#F0A202",
      "--sinal-escuro": "#D48C00",
      "--borda": "#D5E0E6",
      "--mutado": "#5C7382",
      "--texto": "#243844",
      "--sinal-rgb": "240, 162, 2"
    },
    oceano: {
      "--ink": "#0A1F2E",
      "--ink-soft": "#163A52",
      "--papel": "#EEF4F7",
      "--sinal": "#1AA6B8",
      "--sinal-escuro": "#148A99",
      "--borda": "#C9D8E0",
      "--mutado": "#5A7384",
      "--texto": "#1E3544",
      "--sinal-rgb": "26, 166, 184"
    },
    floresta: {
      "--ink": "#0F1F14",
      "--ink-soft": "#1A3322",
      "--papel": "#F0F5F1",
      "--sinal": "#2F9E5B",
      "--sinal-escuro": "#24804A",
      "--borda": "#C9D9CE",
      "--mutado": "#5C7564",
      "--texto": "#24382C",
      "--sinal-rgb": "47, 158, 91"
    },
    rubi: {
      "--ink": "#1A1214",
      "--ink-soft": "#2E1E22",
      "--papel": "#F6F1F2",
      "--sinal": "#C44B3A",
      "--sinal-escuro": "#A33C2E",
      "--borda": "#E0D4D5",
      "--mutado": "#7A6366",
      "--texto": "#3A282A",
      "--sinal-rgb": "196, 75, 58"
    },
    ardosia: {
      "--ink": "#1C1F24",
      "--ink-soft": "#2C323A",
      "--papel": "#F3F3F5",
      "--sinal": "#C47A3A",
      "--sinal-escuro": "#A5642E",
      "--borda": "#D6D8DC",
      "--mutado": "#6B7078",
      "--texto": "#2E333A",
      "--sinal-rgb": "196, 122, 58"
    }
  };

  const ZAP_SVG =
    '<span class="link-btn__icone" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.15-1.18-.06-.11-.23-.17-.48-.29Z"/></svg></span>';

  const modoMarca = /^\/painel\/marca\/?$/i.test(location.pathname);

  let perfil = null;
  let paginaDados = null;
  let saveTimer = null;
  let slugTimer = null;
  let marcaSaveTimer = null;
  let fotoLocalUrl = null;
  let marcaLogoLocalUrl = null;
  let assetVersao = 0;
  let previewBlocosTimer = null;
  let previewRaf = 0;
  let marcaAtualId = null;
  let marcaAtual = null;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(el, msg, tipo) {
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.tipo = tipo || "";
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  function alvoVisivel(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    return !el.closest("[hidden]");
  }

  function setAjudaAberta(botao, aberto) {
    const id = botao.getAttribute("aria-controls");
    const painel = id ? document.getElementById(id) : null;
    botao.setAttribute("aria-expanded", aberto ? "true" : "false");
    if (painel) painel.hidden = !aberto;
  }

  function initAjudas() {
    if (document.documentElement.dataset.ajudasInit) return;
    document.documentElement.dataset.ajudasInit = "1";
    document.addEventListener("click", (ev) => {
      const botao = ev.target.closest("[data-ajuda-toggle]");
      if (!botao) return;
      ev.preventDefault();
      ev.stopPropagation();
      const aberto = botao.getAttribute("aria-expanded") === "true";
      setAjudaAberta(botao, !aberto);
    });
  }

  function abrirManual(ev) {
    if (ev) ev.preventDefault();
    const secao = document.getElementById("secao-manual");
    if (!secao || secao.hidden) return;
    const primeiro = secao.querySelector("details");
    if (primeiro) primeiro.open = true;
    secao.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start"
    });
    document.getElementById("manual-titulo")?.focus();
  }

  function dadosEssenciaisPreenchidos() {
    const nome =
      document.getElementById("campo-nome")?.value?.trim() || paginaDados?.nome || "";
    const zap = montarWhatsapp() || paginaDados?.whatsapp || "";
    return !!(nome && zap);
  }

  const PASSOS_TRILHA = [
    {
      id: "assinar",
      titulo: "Assinar um plano",
      texto: "Escolha mensal ou anual para liberar o editor.",
      alvo: "secao-assinatura"
    },
    {
      id: "url",
      titulo: "Escolher o endereço",
      texto: "Reserve o link definitivo da sua página.",
      alvo: "secao-url"
    },
    {
      id: "dados",
      titulo: "Preencher seus dados",
      texto: "Nome, foto e WhatsApp — o essencial para o cliente te achar.",
      alvo: "secao-identidade"
    },
    {
      id: "marcas",
      titulo: "Adicionar marcas",
      texto: "Coloque as empresas que você representa.",
      alvo: "secao-marcas"
    },
    {
      id: "atuacao",
      titulo: "Marcar onde você atende",
      texto: "Estados e cidades aparecem no mapa da página.",
      alvo: "secao-atuacao"
    },
    {
      id: "publicar",
      titulo: "Publicar e compartilhar",
      texto: "Deixe a página no ar e envie o link.",
      alvo: "secao-pagina"
    }
  ];

  function trilhaConcluido(id) {
    switch (id) {
      case "assinar":
        return assinaturaLibera(perfil?.assinatura);
      case "url":
        return !!perfil?.pagina?.slug;
      case "dados":
        return dadosEssenciaisPreenchidos();
      case "marcas":
        return (paginaDados?.marcas || []).length > 0;
      case "atuacao":
        return (paginaDados?.estados || []).length > 0 || ufsSelecionadas().length > 0;
      case "publicar":
        return !!perfil?.pagina?.publicado;
      default:
        return false;
    }
  }

  function renderTrilha() {
    const lista = document.getElementById("trilha-lista");
    const agoraEl = document.getElementById("trilha-agora");
    if (!lista || modoMarca) return;

    const estados = PASSOS_TRILHA.map((passo) => ({
      ...passo,
      feito: trilhaConcluido(passo.id)
    }));
    const atual = estados.find((passo) => !passo.feito) || null;

    lista.innerHTML = estados
      .map((passo, i) => {
        const fase = passo.feito ? "feito" : atual && atual.id === passo.id ? "agora" : "depois";
        const estadoTexto = fase === "feito" ? "Feito" : fase === "agora" ? "Agora" : "Depois";
        const numero = fase === "feito" ? "✓" : String(i + 1);
        const mostrarLink = fase !== "depois" && alvoVisivel(passo.alvo);
        const current = fase === "agora" ? ' aria-current="step"' : "";
        return `<li class="painel-trilha__passo painel-trilha__passo--${fase}"${current} tabindex="-1">
          <span class="painel-trilha__indice" aria-hidden="true">${numero}</span>
          <div class="painel-trilha__corpo">
            <h3>${esc(passo.titulo)}</h3>
            <p>${esc(fase === "feito" ? "Concluído." : passo.texto)}</p>
          </div>
          <div class="painel-trilha__lado">
            <span class="painel-trilha__estado">${estadoTexto}</span>
            ${
              mostrarLink
                ? `<a href="#${passo.alvo}">${fase === "feito" ? "Ver" : "Ir para este passo"}</a>`
                : ""
            }
          </div>
        </li>`;
      })
      .join("");

    if (agoraEl) {
      agoraEl.textContent = atual
        ? `Seu próximo passo: ${atual.titulo}. ${atual.texto}`
        : "Tudo pronto. Sua página está no ar — compartilhe o link com seus clientes.";
    }
  }

  function focarProximoPassoTrilha() {
    renderTrilha();
    const atual = document.querySelector('.painel-trilha__passo[aria-current="step"]');
    const link = atual?.querySelector("a");
    const alvo = link || atual || document.getElementById("trilha-agora");
    atual?.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
    alvo?.focus?.();
  }

  function textoResumoPreview(c) {
    const nome =
      (c.destaque === "empresa" ? c.empresa : c.nome) || c.nome || c.empresa || "Sem nome ainda";
    const partes = [nome];
    if (c.whatsapp) partes.push("botão de WhatsApp");
    const nMarcas = (c.marcas || []).length;
    if (nMarcas) partes.push(`${nMarcas} ${nMarcas === 1 ? "marca" : "marcas"}`);
    const nEstados = (c.estados || []).length;
    if (nEstados) partes.push(`mapa com ${nEstados} ${nEstados === 1 ? "estado" : "estados"}`);
    const nCats = (c.catalogos || []).length;
    if (nCats) partes.push(`${nCats} ${nCats === 1 ? "catálogo" : "catálogos"}`);
    return `Prévia da página: ${partes.join(" · ")}.`;
  }

  function atualizarResumoPreview() {
    const el = document.getElementById("painel-preview-resumo");
    if (!el) return;
    el.textContent = textoResumoPreview(estadoPreview());
  }

  function atualizarResumoPreviewMarca(estado) {
    const el = document.getElementById("marca-preview-resumo");
    if (!el || !estado?.marca) return;
    const partes = [estado.marca.nome || "Marca"];
    if (estado.marca.descricao) partes.push("texto de apresentação");
    if (estado.marca.site) partes.push("site");
    if (estado.marca.contato?.valor) partes.push("contato extra");
    const nCats = (estado.catalogos || []).length;
    if (nCats) partes.push(`${nCats} ${nCats === 1 ? "catálogo" : "catálogos"}`);
    el.textContent = `Prévia da página da marca: ${partes.join(" · ")}.`;
  }

  async function authHeaders(jsonBody) {
    const h = { Authorization: `Bearer ${await window.MyRepAuth.accessToken()}` };
    if (jsonBody) h["Content-Type"] = "application/json";
    return h;
  }

  function esperarAuth(tentativas = 50) {
    return new Promise((resolve, reject) => {
      let n = 0;
      const tick = () => {
        if (window.MyRepAuth && window.MyRepAuth.pronto()) return resolve();
        if (++n >= tentativas) return reject(new Error("Auth não configurada."));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  function urlAbsoluta(path) {
    try {
      return new URL(path, location.origin).href;
    } catch {
      return path;
    }
  }

  function assinaturaLibera(assinatura) {
    return assinatura && ["ativa", "inadimplente"].includes(assinatura.status);
  }

  function labelStatus(assinatura) {
    if (!assinatura) return { texto: "Sem assinatura", status: "pendente" };
    if (assinatura.plano === "vitalicio" && assinatura.status === "ativa") {
      return { texto: "Vitalício", status: "ativa" };
    }
    const mapa = {
      ativa: "Adimplente",
      inadimplente: "Inadimplente",
      cancelada: "Cancelada",
      pendente: "Pagamento pendente"
    };
    return { texto: mapa[assinatura.status] || assinatura.status, status: assinatura.status };
  }

  function parseWhatsapp(numero) {
    const n = String(numero || "").replace(/\D/g, "");
    if (n.length < 10) return { ddd: "", num: "" };
    if (n.startsWith("55") && n.length >= 12) {
      return { ddd: n.slice(2, 4), num: n.slice(4) };
    }
    return { ddd: n.slice(0, 2), num: n.slice(2) };
  }

  function montarWhatsapp() {
    const ddd = document.getElementById("campo-whatsapp-ddd")?.value || "";
    const num = document.getElementById("campo-whatsapp-num")?.value || "";
    const d = String(ddd).replace(/\D/g, "").slice(0, 2);
    const n = String(num).replace(/\D/g, "").slice(0, 9);
    if (!d || !n) return "";
    return `55${d}${n}`;
  }

  function extrairInstagramDeContatos(contatos) {
    const lista = Array.isArray(contatos) ? contatos : [];
    const item = lista.find((c) => String(c.canal || "").toLowerCase() === "instagram");
    return item?.valor || "";
  }

  function normalizarInstagram(valor) {
    const bruto = String(valor || "").trim();
    if (!bruto) return null;

    let handle = bruto;
    if (/^https?:\/\//i.test(bruto)) {
      const match = bruto.match(/instagram\.com\/([^/?#]+)/i);
      if (!match) return null;
      handle = match[1];
    } else if (/instagram\.com\//i.test(bruto)) {
      const match = bruto.match(/instagram\.com\/([^/?#]+)/i);
      if (!match) return null;
      handle = match[1];
    }

    handle = handle.replace(/^@/, "").trim();
    if (!handle) return null;

    return {
      canal: "Instagram",
      valor: `@${handle}`,
      link: `https://instagram.com/${handle}`
    };
  }

  function mesclarContatosInstagram(contatosBase, valorInstagram) {
    const base = (Array.isArray(contatosBase) ? contatosBase : []).filter(
      (c) => String(c.canal || "").toLowerCase() !== "instagram"
    );
    const ig = normalizarInstagram(valorInstagram);
    if (ig) base.push(ig);
    return base;
  }

  function ufsSelecionadas() {
    return [...document.querySelectorAll("#ufs-grid input[type=checkbox]:checked")].map((el) => el.value);
  }

  const cacheCidades = new Map();
  let municipiosIndice = null;
  let comboboxAberto = null;

  function normalizarCidade(s) {
    if (window.MyRepMapa?.normalizar) return window.MyRepMapa.normalizar(s);
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  async function carregarMunicipiosIndice() {
    if (municipiosIndice) return municipiosIndice;
    try {
      const resp = await fetch("/geo/municipios.json");
      if (!resp.ok) throw new Error("indisponível");
      municipiosIndice = await resp.json();
    } catch {
      municipiosIndice = {};
    }
    return municipiosIndice;
  }

  function cidadesPorUf() {
    const out = {};
    document.querySelectorAll("[data-cidades-uf]").forEach((wrap) => {
      const uf = wrap.getAttribute("data-cidades-uf");
      out[uf] = [...wrap.querySelectorAll('input[type="checkbox"][data-cidade-nome]:checked')]
        .map((el) => el.value)
        .filter(Boolean);
    });
    return out;
  }

  function formatarResumoCidades(selecionadas) {
    if (!selecionadas.length) return "Estado inteiro";
    if (selecionadas.length === 1) return selecionadas[0];
    if (selecionadas.length === 2) return `${selecionadas[0]}, ${selecionadas[1]}`;
    return `${selecionadas[0]}, ${selecionadas[1]} +${selecionadas.length - 2}`;
  }

  function fecharComboboxAberto() {
    if (!comboboxAberto) return;
    comboboxAberto.classList.remove("cidades-combobox--aberto");
    comboboxAberto.querySelector(".cidades-combobox__painel")?.setAttribute("hidden", "");
    comboboxAberto.querySelector(".cidades-combobox__trigger")?.setAttribute("aria-expanded", "false");
    comboboxAberto = null;
  }

  function abrirCombobox(combobox) {
    if (comboboxAberto && comboboxAberto !== combobox) fecharComboboxAberto();
    combobox.classList.add("cidades-combobox--aberto");
    combobox.querySelector(".cidades-combobox__painel")?.removeAttribute("hidden");
    combobox.querySelector(".cidades-combobox__trigger")?.setAttribute("aria-expanded", "true");
    comboboxAberto = combobox;
    const busca = combobox.querySelector(".cidades-combobox__busca");
    if (busca) {
      busca.value = "";
      filtrarListaCombobox(combobox, "");
      busca.focus();
    }
  }

  function atualizarResumoCombobox(combobox) {
    const selecionadas = [...combobox.querySelectorAll('input[type="checkbox"][data-cidade-nome]:checked')].map(
      (el) => el.value
    );
    const resumo = combobox.querySelector(".cidades-combobox__resumo");
    if (resumo) resumo.textContent = formatarResumoCidades(selecionadas);
  }

  function filtrarListaCombobox(combobox, termo) {
    const norm = normalizarCidade(termo);
    let visiveis = 0;
    combobox.querySelectorAll(".cidades-combobox__item").forEach((item) => {
      const nome = item.querySelector("input")?.value || "";
      const ocultar = Boolean(norm && !normalizarCidade(nome).includes(norm));
      item.hidden = ocultar;
      if (!ocultar) visiveis += 1;
    });
    const aviso = combobox.querySelector(".cidades-combobox__vazio--filtro");
    if (aviso) {
      if (norm && visiveis === 0) aviso.removeAttribute("hidden");
      else aviso.setAttribute("hidden", "");
    }
  }

  function mesclarCidadesDisponiveis(disponiveis, selecionadas) {
    const dispNorm = new Set(disponiveis.map(normalizarCidade));
    const extras = selecionadas.filter((nome) => !dispNorm.has(normalizarCidade(nome)));
    return [...extras, ...disponiveis];
  }

  function montarComboboxCidades(uf, selecionadas, disponiveis) {
    const lista = mesclarCidadesDisponiveis(disponiveis, selecionadas);
    const selNorm = new Set(selecionadas.map(normalizarCidade));
    const resumo = formatarResumoCidades(selecionadas);
    const idBase = `cidades-${uf.toLowerCase()}`;

    const itens = lista
      .map((nome) => {
        const id = `${idBase}-${normalizarCidade(nome).replace(/\W+/g, "-")}`;
        const checked = selNorm.has(normalizarCidade(nome)) ? " checked" : "";
        return `<label class="cidades-combobox__item"><input type="checkbox" data-cidade-nome value="${esc(nome)}" id="${esc(id)}"${checked}> ${esc(nome)}</label>`;
      })
      .join("");

    return `<div class="cidades-combobox" data-cidades-combobox>
      <button type="button" class="cidades-combobox__trigger" aria-expanded="false" aria-haspopup="listbox">
        <span class="cidades-combobox__resumo">${esc(resumo)}</span>
      </button>
      <div class="cidades-combobox__painel" hidden>
        <input type="search" class="cidades-combobox__busca" placeholder="Buscar município…" autocomplete="off" aria-label="Buscar município em ${esc(uf)}">
        <div class="cidades-combobox__lista" role="listbox">${
          itens
            ? `${itens}<p class="cidades-combobox__vazio cidades-combobox__vazio--filtro" hidden>Nenhum município encontrado.</p>`
            : '<p class="cidades-combobox__vazio">Nenhum município encontrado.</p>'
        }</div>
      </div>
    </div>`;
  }

  function renderUfsGrid(estados = []) {
    const grid = document.getElementById("ufs-grid");
    if (!grid) return;
    grid.innerHTML = UFS.map(
      (uf) =>
        `<label class="uf-check"><input type="checkbox" value="${uf}" ${
          estados.includes(uf) ? "checked" : ""
        }> ${uf}</label>`
    ).join("");
  }

  async function buscarCidadesUf(uf) {
    if (cacheCidades.has(uf)) return cacheCidades.get(uf);

    if (window.MyRepMapa?.fetchGeo) {
      try {
        const geo = await window.MyRepMapa.fetchGeo(`uf-${uf}.json`);
        const lista = Object.values(geo.areas || {})
          .map((a) => a.nome)
          .sort((a, b) => a.localeCompare(b, "pt-BR"));
        if (lista.length) {
          cacheCidades.set(uf, lista);
          return lista;
        }
      } catch {
        /* tenta próxima fonte */
      }
    }

    const indice = await carregarMunicipiosIndice();
    if (Array.isArray(indice[uf]) && indice[uf].length) {
      cacheCidades.set(uf, indice[uf]);
      return indice[uf];
    }

    try {
      const resp = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`
      );
      if (!resp.ok) throw new Error("IBGE indisponível");
      const data = await resp.json();
      const lista = data.map((m) => m.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
      cacheCidades.set(uf, lista);
      return lista;
    } catch {
      cacheCidades.set(uf, []);
      return [];
    }
  }

  async function renderCidadesEditor(estados, cidadesObj) {
    const wrap = document.getElementById("cidades-por-uf-editor");
    if (!wrap) return;
    fecharComboboxAberto();
    wrap.innerHTML = "";
    for (const uf of estados) {
      const selecionadas = Array.isArray(cidadesObj?.[uf]) ? cidadesObj[uf] : [];
      const div = document.createElement("div");
      div.className = "cidades-uf";
      div.setAttribute("data-cidades-uf", uf);
      div.innerHTML = `<div class="campo">
        <span class="campo__rotulo">${esc(uf)} — cidades</span>
        <div class="cidades-combobox__carregando">Carregando municípios…</div>
      </div>`;
      wrap.appendChild(div);

      const campo = div.querySelector(".campo");
      const disponiveis = await buscarCidadesUf(uf);
      campo.querySelector(".cidades-combobox__carregando")?.remove();
      campo.insertAdjacentHTML("beforeend", montarComboboxCidades(uf, selecionadas, disponiveis));
    }
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

  function botoesOrdem(attrs, desabilitarUp, desabilitarDown) {
    const up = attrs.up ? ` ${attrs.up}` : "";
    const down = attrs.down ? ` ${attrs.down}` : "";
    return `<span class="painel-ordem">
      <button type="button" class="painel-ordem__btn"${up}${desabilitarUp ? " disabled" : ""} aria-label="Subir">↑</button>
      <button type="button" class="painel-ordem__btn"${down}${desabilitarDown ? " disabled" : ""} aria-label="Descer">↓</button>
    </span>`;
  }

  function reordenarLista(lista, id, dir) {
    const idx = lista.findIndex((item) => item.id === id);
    if (idx < 0) return null;
    const novo = idx + (dir === "up" ? -1 : 1);
    if (novo < 0 || novo >= lista.length) return null;
    const arr = [...lista];
    [arr[idx], arr[novo]] = [arr[novo], arr[idx]];
    return arr;
  }

  function reordenarCatalogoNoGrupo(catalogos, marcas, id, dir) {
    const grupos = agruparCatalogos(catalogos, marcas);
    let alterou = false;
    for (const grupo of grupos) {
      const idx = grupo.catalogos.findIndex((c) => c.id === id);
      if (idx < 0) continue;
      const novo = idx + (dir === "up" ? -1 : 1);
      if (novo < 0 || novo >= grupo.catalogos.length) return null;
      const cats = [...grupo.catalogos];
      [cats[idx], cats[novo]] = [cats[novo], cats[idx]];
      grupo.catalogos = cats;
      alterou = true;
      break;
    }
    if (!alterou) return null;
    return grupos.flatMap((g) => g.catalogos);
  }

  function atualizarSelectMarcas(marcas) {
    const sel = document.getElementById("select-marca-catalogo");
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML =
      `<option value="">Nenhuma</option>` +
      (marcas || [])
        .map((m) => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`)
        .join("");
    if (val) sel.value = val;
  }

  function slugMarcaFromNome(nome) {
    const base = String(nome || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    if (base.length >= 2) return base;
    const compacto = String(nome || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (compacto.length >= 2) return compacto.slice(0, 80);
    return "marca";
  }

  function marcasComSlugs(marcas) {
    const usados = new Set();
    return (marcas || []).map((marca) => {
      let base = slugMarcaFromNome(marca.nome);
      if (!base || base.length < 2) base = "marca";
      let slug = base;
      let n = 2;
      while (usados.has(slug)) {
        slug = `${base}-${n}`.slice(0, 80);
        n += 1;
      }
      usados.add(slug);
      return { ...marca, slug };
    });
  }

  function urlMarcaPreview(marca, slugRep) {
    if (!slugRep || !marca) return "";
    const slug = marca.slug || slugMarcaFromNome(marca.nome);
    return slug ? `/${slugRep}/${slug}/` : "";
  }

  function idMarcaDaUrl() {
    if (!modoMarca) return "";
    return new URLSearchParams(location.search).get("id") || "";
  }

  function contatoDeValor(valor) {
    const v = String(valor || "").trim();
    if (!v) return null;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { canal: "E-mail", valor: v };
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 8) return { canal: "Telefone", valor: v };
    return { canal: "Contato", valor: v };
  }

  function valorContatoMarca(marca) {
    return marca?.contato?.valor || "";
  }

  function marcaPorId(id) {
    return (paginaDados?.marcas || []).find((m) => m.id === id) || null;
  }

  function renderMarcas(marcas) {
    const lista = document.getElementById("lista-marcas");
    if (!lista) return;
    const slugRep = perfil?.pagina?.slug || "";
    const itens = marcasComSlugs(marcas || []);
    lista.innerHTML = itens.length
      ? itens
          .map(
            (m, i) => {
              const url = urlMarcaPreview(m, slugRep);
              const hrefPagina = `/painel/marca/?id=${encodeURIComponent(m.id)}`;
              return `<li>
              <span class="painel-lista__corpo">
                ${botoesOrdem(
                  { up: `data-marca-up="${esc(m.id)}"`, down: `data-marca-down="${esc(m.id)}"` },
                  i === 0,
                  i === itens.length - 1
                )}
                <span class="painel-lista__texto-marca">
                  <strong>${esc(m.nome)}</strong>
                  ${url ? `<span class="painel-lista__url"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></span>` : ""}
                </span>
              </span>
              <span class="painel-lista__acoes">
                <a class="btn btn--fantasma-ink btn--compacto" href="${esc(hrefPagina)}">Montar página da ${esc(m.nome)}</a>
                <button type="button" class="btn-link" data-rm-marca="${esc(m.id)}" aria-label="Remover ${esc(m.nome)}">Remover</button>
              </span>
            </li>`;
            }
          )
          .join("")
      : "<li class='painel-lista__vazio'>Nenhuma marca ainda. Adicione a primeira abaixo — cada logo vira um atalho na sua página.</li>";
    atualizarSelectMarcas(itens);
  }

  function renderCatalogosMarca(marcaId) {
    const lista = document.getElementById("marca-pagina-catalogos");
    if (!lista) return;
    const cats = (paginaDados?.catalogos || []).filter((c) => c.marcaId === marcaId);
    lista.innerHTML = cats.length
      ? cats.map((c) => `<li><span>${esc(c.titulo || c.arquivo)}</span></li>`).join("")
      : "<li class='painel-lista__vazio'>Nenhum catálogo vinculado a esta marca.</li>";
  }

  function sincronizarLogoMarcaCampo(marca) {
    const input = document.getElementById("marca-pagina-logo");
    if (!input || !marca?.logo) return;
    const zona = input.closest(".campo-arquivo__zona");
    if (!zona) return;
    const vazio = zona.querySelector(".campo-arquivo__vazio");
    const preenchido = zona.querySelector(".campo-arquivo__preenchido");
    const thumb = zona.querySelector(".campo-arquivo__thumb");
    const nome = zona.querySelector(".campo-arquivo__nome");
    if (!vazio || !preenchido) return;
    const src = urlAsset(marca.logo);
    if (src && thumb) {
      thumb.src = src;
      thumb.alt = `Logo de ${marca.nome || "marca"}`;
    }
    if (nome) nome.textContent = marca.logo;
    vazio.hidden = true;
    preenchido.hidden = false;
  }

  function estadoMarcaPreview() {
    const form = document.getElementById("form-marca-pagina");
    const dados = paginaDados || {};
    const nome = form?.nome?.value?.trim() || marcaAtual?.nome || "";
    const descricao = form?.descricao?.value?.trim() || "";
    const siteBruto = form?.site?.value?.trim() || "";
    const site = siteBruto ? (siteBruto.match(/^https?:\/\//i) ? siteBruto : `https://${siteBruto}`) : "";
    const contatoExtra = contatoDeValor(form?.contatoExtra?.value || "");
    const logo = marcaLogoLocalUrl || marcaAtual?.logo || "";
    const slug = slugMarcaFromNome(nome);
    const marca = {
      ...(marcaAtual || {}),
      id: marcaAtualId,
      nome,
      descricao,
      logo,
      slug,
      ...(site ? { site } : {}),
      ...(contatoExtra ? { contato: contatoExtra } : {})
    };
    return {
      slug: perfil?.pagina?.slug || "",
      paleta: dados.paleta || "ambar",
      whatsapp: dados.whatsapp || "",
      mensagemWhatsapp: dados.mensagemWhatsapp || "",
      nome: dados.nome || "",
      empresa: dados.empresa || "",
      destaque: dados.destaque || "pessoa",
      marca,
      catalogos: (dados.catalogos || []).filter((c) => c.marcaId === marcaAtualId)
    };
  }

  function nomeRepresentantePreview(c) {
    const destaqueEmpresa = c.destaque === "empresa" && temTexto(c.empresa);
    return destaqueEmpresa ? c.empresa : c.nome || c.empresa || "Representante";
  }

  function htmlPerfilMarcaPreview(estado) {
    const marca = estado.marca;
    const repNome = nomeRepresentantePreview(estado);
    const slugRep = estado.slug || "";
    const voltar = slugRep
      ? `<p class="capa__voltar"><a href="/${esc(slugRep)}/">← Representada por ${esc(repNome)}</a></p>`
      : "";
    const logoSrc = marca.logo ? urlAsset(marca.logo) : "";
    const foto = logoSrc
      ? `<img class="capa__foto capa__foto--logo" src="${esc(logoSrc)}" alt="${esc(marca.nome)}" width="96" height="96">`
      : `<div class="capa__foto capa__foto--inicial" aria-hidden="true">${esc((marca.nome || "M").slice(0, 1))}</div>`;
    const descricao = temTexto(marca.descricao) ? `<p class="capa__bio">${esc(marca.descricao)}</p>` : "";
    const numero = String(estado.whatsapp || "").replace(/\D/g, "");
    let zap = "";
    if (numero) {
      const msg = temTexto(estado.mensagemWhatsapp) ? "?text=" + encodeURIComponent(estado.mensagemWhatsapp) : "";
      zap = `<a class="link-btn link-btn--destaque" href="https://wa.me/${numero}${msg}" target="_blank" rel="noopener">
      ${ZAP_SVG}
      <span class="link-btn__texto">Falar no WhatsApp</span>
    </a>`;
    }
    return `<div class="cartao__perfil">
    <header class="capa pagina-marca">
      ${voltar}
      ${foto}
      <h1 class="capa__nome">${esc(marca.nome || "Marca")}</h1>
      ${descricao}
    </header>
    <div class="acoes">${zap}</div>
  </div>`;
  }

  function htmlBlocosMarcaPreview(estado) {
    const partes = [];
    const catalogos = estado.catalogos || [];
    if (catalogos.length) {
      const itens = catalogos
        .map((cat) => htmlItemCatalogoPreview(cat, [estado.marca]))
        .join("");
      partes.push(`<section class="bloco bloco--links"><h2 class="rotulo">Catálogos</h2><ul class="links">${itens}</ul></section>`);
    } else {
      partes.push(`<p class="segmentos">Nenhum catálogo desta marca ainda.</p>`);
    }
    const itensContato = [];
    if (temTexto(estado.marca.site)) {
      itensContato.push(`<li><a class="link-btn" href="${esc(estado.marca.site)}" target="_blank" rel="noopener"><span class="link-btn__texto">Site</span><span class="link-btn__meta">${esc(estado.marca.site.replace(/^https?:\/\//i, ""))}</span></a></li>`);
    }
    if (estado.marca.contato && temTexto(estado.marca.contato.canal) && temTexto(estado.marca.contato.valor)) {
      const link = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(estado.marca.contato.valor)
        ? `mailto:${estado.marca.contato.valor}`
        : "#";
      const externo = /^https?:/.test(link) ? ' target="_blank" rel="noopener"' : "";
      itensContato.push(`<li><a class="link-btn" href="${esc(link)}"${externo}><span class="link-btn__texto">${esc(estado.marca.contato.canal)}</span><span class="link-btn__meta">${esc(estado.marca.contato.valor)}</span></a></li>`);
    }
    if (itensContato.length) {
      partes.push(`<section class="bloco bloco--links"><h2 class="rotulo">Contato da marca</h2><ul class="links">${itensContato.join("")}</ul></section>`);
    }
    return partes.join("\n");
  }

  function atualizarPreviewMarca() {
    const root = document.getElementById("marca-preview-pagina");
    if (!root || !marcaAtual) return;
    const estado = estadoMarcaPreview();
    aplicarPaletaPreview(estado.paleta || "ambar", document.getElementById("secao-pagina-marca"));
    root.innerHTML = `<div class="cartao shell--estreito pagina-marca">
      ${htmlPerfilMarcaPreview(estado)}
      <div class="cartao__blocos">${htmlBlocosMarcaPreview(estado)}</div>
      <footer class="rodape"><p class="rodape__creditos"><span class="marca marca--compacta"><img src="/img/logo.png" alt="My Rep" width="28" height="28"></span></p></footer>
    </div>`;
    atualizarResumoPreviewMarca(estado);
  }

  function agendarPreviewMarca() {
    clearTimeout(previewBlocosTimer);
    previewBlocosTimer = setTimeout(() => atualizarPreviewMarca(), 220);
  }

  function atualizarCabecalhoMarca(marca) {
    document.title = `Página da ${marca.nome} — Painel`;
    const titulo = document.getElementById("marca-pagina-titulo");
    if (titulo) titulo.textContent = `Página da ${marca.nome}`;
    const previewTitulo = document.getElementById("marca-preview-titulo");
    if (previewTitulo) previewTitulo.textContent = `Como fica a página da ${marca.nome}`;
    const slugRep = perfil?.pagina?.slug || "";
    const slugMarca = marca.slug || slugMarcaFromNome(marca.nome);
    const urlPublica = slugRep && slugMarca ? `/${slugRep}/${slugMarca}/` : "";
    const contexto = document.getElementById("marca-pagina-contexto");
    if (contexto) {
      contexto.textContent = urlPublica
        ? `Quem clicar no logo da ${marca.nome} abre este endereço: ${urlPublica}. Aqui você define o que aparece nessa página.`
        : `Aqui você define o que aparece na página dedicada da ${marca.nome}.`;
    }
  }

  function preencherEditorMarca(marca, opts = {}) {
    marcaAtual = marca;
    marcaAtualId = marca.id;
    atualizarCabecalhoMarca(marca);

    const titulo = document.getElementById("marca-pagina-titulo");
    if (opts.focar && titulo) titulo.focus();
    const form = document.getElementById("form-marca-pagina");
    const erro = document.getElementById("marca-pagina-erro");
    if (form) {
      form.hidden = false;
      form.querySelector("#marca-pagina-id").value = marca.id;
      form.nome.value = marca.nome || "";
      form.descricao.value = marca.descricao || "";
      form.site.value = marca.site ? marca.site.replace(/^https?:\/\//i, "") : "";
      form.contatoExtra.value = valorContatoMarca(marca);
      limparArquivoCampo(form.querySelector(".campo-arquivo__input"));
      sincronizarLogoMarcaCampo(marca);
    }
    if (erro) erro.hidden = true;

    renderCatalogosMarca(marca.id);
    atualizarPreviewMarca();
  }

  function mostrarErroMarca() {
    document.title = "Marca não encontrada — Painel";
    document.getElementById("marca-pagina-erro")?.removeAttribute("hidden");
    document.getElementById("form-marca-pagina")?.setAttribute("hidden", "");
    document.getElementById("marca-pagina-contexto").textContent = "";
    const titulo = document.getElementById("marca-pagina-titulo");
    if (titulo) {
      titulo.textContent = "Marca não encontrada";
      titulo.focus();
    }
  }

  function iniciarModoMarca() {
    if (!modoMarca) return;
    marcaAtualId = idMarcaDaUrl();
    document.getElementById("painel-intro")?.setAttribute("hidden", "");
    document.getElementById("secao-assinatura")?.setAttribute("hidden", "");
    document.getElementById("secao-url")?.setAttribute("hidden", "");
    document.getElementById("secao-pagina")?.setAttribute("hidden", "");
    document.getElementById("secao-editor")?.setAttribute("hidden", "");
    document.getElementById("secao-suporte")?.setAttribute("hidden", "");
    document.getElementById("secao-trilha")?.setAttribute("hidden", "");
    document.getElementById("secao-manual")?.setAttribute("hidden", "");
    document.getElementById("link-manual-topo")?.setAttribute("hidden", "");
    document.getElementById("secao-pagina-marca")?.removeAttribute("hidden");

    if (!marcaAtualId) {
      mostrarErroMarca();
      return;
    }
    const marca = marcaPorId(marcaAtualId);
    if (!marca) {
      mostrarErroMarca();
      return;
    }
    preencherEditorMarca(marcasComSlugs([marca])[0], { focar: true });
  }

  async function salvarMarcaPagina(opts = {}) {
    const status = document.getElementById("marca-pagina-status");
    const form = document.getElementById("form-marca-pagina");
    if (!form || !marcaAtualId) return;
    const nome = form.nome?.value?.trim() || "";
    if (!nome) {
      setStatus(status, "Informe o nome da marca.", "erro");
      return;
    }
    setStatus(status, "Salvando…", "info");
    try {
      const file = form.arquivo?.files?.[0];
      if (file && file.size > MAX_IMAGEM) {
        setStatus(status, "Logo grande demais (máx. 8 MB).", "erro");
        return;
      }
      let arquivo = "";
      if (file) arquivo = await enviarArquivoStorage(file, "marca", nome);
      const contato = contatoDeValor(form.contatoExtra?.value || "");
      const body = {
        acao: "marca_editar",
        id: marcaAtualId,
        nome,
        descricao: form.descricao?.value?.trim() || "",
        site: form.site?.value?.trim() || ""
      };
      if (contato) {
        body.contatoCanal = contato.canal;
        body.contatoValor = contato.valor;
      } else {
        body.contatoCanal = "";
        body.contatoValor = "";
      }
      if (arquivo) body.arquivo = arquivo;
      const data = await apiPagina("POST", body);
      aplicarPagina(data.pagina, { silencioso: true });
      if (marcaLogoLocalUrl) {
        URL.revokeObjectURL(marcaLogoLocalUrl);
        marcaLogoLocalUrl = null;
      }
      const atualizada = marcaPorId(marcaAtualId);
      if (atualizada) {
        marcaAtual = marcasComSlugs([atualizada])[0];
        atualizarCabecalhoMarca(marcaAtual);
        renderCatalogosMarca(marcaAtualId);
        if (arquivo) sincronizarLogoMarcaCampo(marcaAtual);
        atualizarPreviewMarca();
      }
      if (!opts.silencioso) setStatus(status, "Alterações salvas.", "ok");
      else setStatus(status, "Salvo.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  }

  function agendarSaveMarca() {
    agendarPreviewMarca();
    clearTimeout(marcaSaveTimer);
    marcaSaveTimer = setTimeout(() => salvarMarcaPagina({ silencioso: true }), 800);
  }

  function renderCatalogos(catalogos, marcas) {
    const lista = document.getElementById("lista-catalogos");
    if (!lista) return;
    const cats = catalogos || [];
    if (!cats.length) {
      lista.innerHTML =
        "<li class='painel-lista__vazio'>Nenhum catálogo ainda. Envie um PDF abaixo para o cliente baixar na sua página.</li>";
      return;
    }

    const grupos = agruparCatalogos(cats, marcas);
    lista.innerHTML = grupos
      .map((grupo) => {
        const titulo = grupo.tipo === "outros" ? "Outros" : grupo.marca.nome;
        const itens = grupo.catalogos
          .map(
            (c, i) =>
              `<li>
              <span class="painel-lista__corpo">
                ${botoesOrdem(
                  { up: `data-cat-up="${esc(c.id)}"`, down: `data-cat-down="${esc(c.id)}"` },
                  i === 0,
                  i === grupo.catalogos.length - 1
                )}
                <span>${esc(c.titulo || c.arquivo)}</span>
              </span>
              <button type="button" class="btn-link" data-rm-catalogo="${esc(c.id)}">Remover</button>
            </li>`
          )
          .join("");
        return `<li class="painel-lista__grupo">
          <span class="painel-lista__grupo-titulo">${esc(titulo)}</span>
          <ul class="painel-lista painel-lista--aninhada">${itens}</ul>
        </li>`;
      })
      .join("");
  }

  function preencherEditor(dados) {
    paginaDados = dados || {};
    document.getElementById("campo-empresa").value = paginaDados.empresa || "";
    document.getElementById("campo-nome").value = paginaDados.nome || "";
    document.getElementById("campo-cargo").value = paginaDados.cargo || "";
    document.getElementById("campo-bio").value = paginaDados.bio || "";
    document.getElementById("campo-segmentos").value = paginaDados.segmentos || "";
    document.getElementById("campo-mensagem-zap").value = paginaDados.mensagemWhatsapp || "";

    const zap = parseWhatsapp(paginaDados.whatsapp);
    document.getElementById("campo-whatsapp-ddd").value = zap.ddd;
    document.getElementById("campo-whatsapp-num").value = zap.num;
    document.getElementById("campo-instagram").value = extrairInstagramDeContatos(paginaDados.contatos);

    const destaque = paginaDados.destaque === "empresa" ? "empresa" : "pessoa";
    document.querySelectorAll('input[name="destaque"]').forEach((el) => {
      el.checked = el.value === destaque;
    });

    const fotoTipo = paginaDados.fotoTipo === "logo" ? "logo" : "pessoa";
    document.querySelectorAll('input[name="fotoTipo"]').forEach((el) => {
      el.checked = el.value === fotoTipo;
    });

    const paleta = paginaDados.paleta || "ambar";
    document.querySelectorAll('input[name="paleta"]').forEach((el) => {
      el.checked = el.value === paleta;
    });

    const estados = Array.isArray(paginaDados.estados) ? paginaDados.estados : [];
    renderUfsGrid(estados);

    let cidadesObj = paginaDados.cidades || {};
    if (Array.isArray(cidadesObj) && estados.length === 1) {
      cidadesObj = { [estados[0]]: cidadesObj };
    }
    renderCidadesEditor(estados, cidadesObj).then(() => atualizarPreview({ blocos: true }));

    renderMarcas(paginaDados.marcas);
    renderCatalogos(paginaDados.catalogos, paginaDados.marcas);
    sincronizarFotoSalvaCampo();
    atualizarPreview();
    renderTrilha();
  }

  function payloadTexto() {
    const estados = ufsSelecionadas();
    const cidades = cidadesPorUf();
    const contatos = mesclarContatosInstagram(
      paginaDados?.contatos,
      document.getElementById("campo-instagram")?.value || ""
    );
    return {
      acao: "atualizar",
      empresa: document.getElementById("campo-empresa")?.value?.trim() || "",
      nome: document.getElementById("campo-nome")?.value?.trim() || "",
      cargo: document.getElementById("campo-cargo")?.value?.trim() || "",
      bio: document.getElementById("campo-bio")?.value?.trim() || "",
      segmentos: document.getElementById("campo-segmentos")?.value?.trim() || "",
      mensagemWhatsapp: document.getElementById("campo-mensagem-zap")?.value?.trim() || "",
      whatsapp: montarWhatsapp(),
      destaque: document.querySelector('input[name="destaque"]:checked')?.value || "pessoa",
      paleta: document.querySelector('input[name="paleta"]:checked')?.value || "ambar",
      fotoTipo: document.querySelector('input[name="fotoTipo"]:checked')?.value || "pessoa",
      estados,
      cidades: estados.length <= 1 && estados[0] ? cidades[estados[0]] || [] : cidades,
      contatos
    };
  }

  function temTexto(s) {
    return typeof s === "string" && s.trim() !== "";
  }

  function urlAsset(arquivo) {
    if (!arquivo) return "";
    const s = String(arquivo);
    if (/^(https?:|blob:|data:)/i.test(s)) return s;
    const slug = perfil?.pagina?.slug;
    const base = String(window.MYREP_SUPABASE?.url || "").replace(/\/$/, "");
    if (!slug || !base) return "";
    const bucket = window.MYREP_SUPABASE?.storageBucket || "assets-clientes";
    const nome = s.split("/").pop();
    const url = `${base}/storage/v1/object/public/${bucket}/${slug}/${encodeURIComponent(nome)}`;
    return assetVersao ? `${url}?v=${assetVersao}` : url;
  }

  function estadoPreview() {
    const texto = payloadTexto();
    const dados = paginaDados || {};
    return {
      slug: perfil?.pagina?.slug || "",
      ...dados,
      ...texto,
      foto: fotoLocalUrl || dados.foto || "",
      marcas: marcasComSlugs(dados.marcas || []),
      catalogos: dados.catalogos || [],
      contatos: texto.contatos || dados.contatos || []
    };
  }

  function cidadesNormalizadas(c) {
    const estados = Array.isArray(c.estados) ? c.estados.map((u) => String(u).toUpperCase()) : [];
    const porUf = {};
    for (const uf of estados) porUf[uf] = [];
    if (Array.isArray(c.cidades) && estados.length === 1) {
      porUf[estados[0]] = c.cidades.filter(temTexto);
      return porUf;
    }
    if (c.cidades && typeof c.cidades === "object") {
      for (const [uf, lista] of Object.entries(c.cidades)) {
        const chave = String(uf).toUpperCase();
        if (!porUf[chave]) continue;
        porUf[chave] = Array.isArray(lista) ? lista.filter(temTexto) : [];
      }
    }
    return porUf;
  }

  function aplicarPaletaPreview(id, escopo) {
    const vars = PALETAS_PREVIEW[id] || PALETAS_PREVIEW.ambar;
    const raiz = escopo || document;
    const nos = [
      raiz.querySelector?.(".painel-preview__viewport") || (escopo ? null : document.querySelector(".painel-preview__viewport")),
      raiz.querySelector?.(".painel-preview__pagina") || (escopo ? null : document.getElementById("painel-preview-pagina"))
    ].filter(Boolean);
    for (const el of nos) {
      for (const [chave, valor] of Object.entries(vars)) el.style.setProperty(chave, valor);
    }
  }

  function htmlPerfilPreview(c) {
    const destaqueEmpresa = c.destaque === "empresa" && temTexto(c.empresa);
    const tituloPrincipal = destaqueEmpresa ? c.empresa : c.nome;
    const tituloSecundario = destaqueEmpresa ? c.nome : c.empresa;
    const nome = temTexto(tituloPrincipal) ? esc(tituloPrincipal) : "Seu nome";
    const linhaSecundaria = temTexto(tituloSecundario)
      ? `<p class="capa__empresa${destaqueEmpresa ? " capa__empresa--abaixo" : ""}">${esc(tituloSecundario)}</p>`
      : "";
    const antesNome = destaqueEmpresa ? "" : linhaSecundaria;
    const depoisNome = destaqueEmpresa ? linhaSecundaria : "";
    const cargo = temTexto(c.cargo) ? `<p class="capa__cargo">${esc(c.cargo)}</p>` : "";
    const bio = temTexto(c.bio) ? `<p class="capa__bio">${esc(c.bio)}</p>` : "";
    const fotoSrc = urlAsset(c.foto);
    const fotoClasse = c.fotoTipo === "logo" ? "capa__foto capa__foto--logo" : "capa__foto";
    const altFoto = destaqueEmpresa ? `Logo ou foto de ${c.empresa || "sua empresa"}` : `Foto de ${c.nome || "você"}`;
    const foto = fotoSrc
      ? `<img class="${fotoClasse}" src="${esc(fotoSrc)}" alt="${esc(altFoto)}" width="96" height="96">`
      : `<div class="capa__foto capa__foto--placeholder" aria-hidden="true"></div>`;

    const numero = String(c.whatsapp || "").replace(/\D/g, "");
    let zap = "";
    if (numero) {
      const msg = temTexto(c.mensagemWhatsapp) ? "?text=" + encodeURIComponent(c.mensagemWhatsapp) : "";
      zap = `<a class="link-btn link-btn--destaque" href="https://wa.me/${numero}${msg}" target="_blank" rel="noopener">
      ${ZAP_SVG}
      <span class="link-btn__texto">Falar no WhatsApp</span>
    </a>`;
    }

    return `<div class="cartao__perfil">
    <header class="capa">
      ${foto}
      ${antesNome}
      <h1 class="capa__nome">${nome}</h1>
      ${depoisNome}
      ${cargo}
      ${bio}
    </header>
    <div class="acoes">${zap}</div>
  </div>`;
  }

  function htmlItemCatalogoPreview(cat, marcas) {
    let meta = `<span class="link-btn__meta">${esc(cat.tipo || "PDF")}</span>`;
    if (cat.marcaId) {
      const marca = marcas.find((m) => m.id === cat.marcaId);
      if (marca?.logo) {
        meta = `<img class="link-btn__logo" src="${esc(urlAsset(marca.logo))}" alt="">`;
      }
    } else if (cat.logo) {
      meta = `<img class="link-btn__logo" src="${esc(urlAsset(cat.logo))}" alt="">`;
    }
    const href = urlAsset(cat.arquivo) || "#";
    return `<li><a class="link-btn" href="${esc(href)}" target="_blank" rel="noopener"><span class="link-btn__texto">${esc(cat.titulo || "Catálogo")}</span>${meta}</a></li>`;
  }

  function htmlCabecaGrupoPreview(marca, titulo, slugRep) {
    const logo = marca?.logo
      ? `<img class="catalogo-grupo__logo" src="${esc(urlAsset(marca.logo))}" alt="">`
      : "";
    const nome = esc(titulo || marca?.nome || "Outros");
    const url = !titulo && marca ? urlMarcaPreview(marca, slugRep) : "";
    const conteudo = url
      ? `<a class="catalogo-grupo__link-marca" href="${esc(url)}">${logo}<span class="catalogo-grupo__nome">${nome}</span></a>`
      : `${logo}<span class="catalogo-grupo__nome">${nome}</span>`;
    return `<summary class="catalogo-grupo__cabeca">${conteudo}<span class="catalogo-grupo__seta" aria-hidden="true"></span></summary>`;
  }

  function htmlCatalogosPreview(c) {
    const catalogos = Array.isArray(c.catalogos) ? c.catalogos : [];
    if (!catalogos.length) return "";

    const marcas = marcasComSlugs(Array.isArray(c.marcas) ? c.marcas : []);
    const slugRep = c.slug || "";
    const grupos = agruparCatalogos(catalogos, marcas);
    const temGruposMarca = grupos.some((g) => g.tipo === "marca");

    if (!temGruposMarca) {
      const itens = catalogos.map((cat) => htmlItemCatalogoPreview(cat, marcas)).join("");
      return `<section class="bloco bloco--links"><h2 class="rotulo">Catálogos</h2><ul class="links">${itens}</ul></section>`;
    }

    const detalhes = grupos
      .map((grupo) => {
        const titulo = grupo.tipo === "outros" ? "Outros" : null;
        const itens = grupo.catalogos.map((cat) => htmlItemCatalogoPreview(cat, marcas)).join("");
        return `<details class="catalogo-grupo">${htmlCabecaGrupoPreview(grupo.marca, titulo, slugRep)}<ul class="links catalogo-grupo__links">${itens}</ul></details>`;
      })
      .join("");

    return `<section class="bloco bloco--links"><h2 class="rotulo">Catálogos</h2><div class="catalogos-grupos">${detalhes}</div></section>`;
  }

  function htmlBlocosPreview(c) {
    const partes = [];
    const marcas = marcasComSlugs(Array.isArray(c.marcas) ? c.marcas : []);
    const slugRep = c.slug || "";
    if (marcas.length) {
      const itens = marcas
        .map((m) => {
          const href = esc(urlMarcaPreview(m, slugRep) || "#");
          const conteudo = m.logo
            ? `<img src="${esc(urlAsset(m.logo))}" alt="${esc(m.nome)}">`
            : `<span class="marca-chip__nome">${esc(m.nome)}</span>`;
          return `<li><a class="marca-chip" href="${href}">${conteudo}</a></li>`;
        })
        .join("");
      partes.push(`<section class="bloco bloco--marcas"><h2 class="rotulo">Marcas</h2><ul class="marcas">${itens}</ul></section>`);
    }

    const estados = Array.isArray(c.estados) ? c.estados.map((u) => String(u).toUpperCase()) : [];
    if (estados.length || temTexto(c.segmentos)) {
      const porUf = cidadesNormalizadas(c);
      const glow = (PALETAS_PREVIEW[c.paleta] || PALETAS_PREVIEW.ambar)["--sinal"];
      const drill = estados.length > 1 ? ' data-mapa="drill"' : "";
      const seg = temTexto(c.segmentos) ? `<p class="segmentos">${esc(c.segmentos)}</p>` : "";
      partes.push(`<section class="bloco bloco--atuacao"${drill} data-mapa-mount data-estados="${esc(JSON.stringify(estados))}" data-cidades="${esc(JSON.stringify(porUf))}" data-glow="${esc(glow)}">
    <h2 class="rotulo">Atuação</h2>
    <div class="mapa-stack">
      <div class="mapa-mount" aria-busy="true"><p class="mapa__carregando">Carregando mapa…</p></div>
      ${seg}
    </div>
  </section>`);
    }

    const catalogosHtml = htmlCatalogosPreview(c);
    if (catalogosHtml) partes.push(catalogosHtml);

    const contatos = Array.isArray(c.contatos) ? c.contatos : [];
    if (contatos.length) {
      const itens = contatos
        .map((ct) => {
          const externo = /^https?:/.test(ct.link || "") ? ' target="_blank" rel="noopener"' : "";
          return `<li><a class="link-btn" href="${esc(ct.link || "#")}"${externo}><span class="link-btn__texto">${esc(ct.canal)}</span><span class="link-btn__meta">${esc(ct.valor)}</span></a></li>`;
        })
        .join("");
      partes.push(`<section class="bloco bloco--links"><h2 class="rotulo">Contato</h2><ul class="links">${itens}</ul></section>`);
    }

    if (!partes.length) {
      return `<p class="painel-preview__vazio">Marcas, mapa e catálogos aparecem aqui conforme você adiciona.</p>`;
    }
    return partes.join("\n");
  }

  function montarMapaPreview(raiz) {
    if (window.MyRepMapa?.montarNos) {
      window.MyRepMapa.montarNos(raiz);
      return;
    }
    setTimeout(() => {
      if (window.MyRepMapa?.montarNos) window.MyRepMapa.montarNos(raiz);
    }, 250);
  }

  function atualizarPreview(opts) {
    const root = document.getElementById("painel-preview-pagina");
    if (!root) return;
    const c = estadoPreview();
    aplicarPaletaPreview(c.paleta || "ambar");

    const soPerfil = opts && opts.perfil && !opts.blocos && root.querySelector(".cartao");
    if (soPerfil) {
      const perfilEl = root.querySelector(".cartao__perfil");
      if (perfilEl) {
        const wrap = document.createElement("div");
        wrap.innerHTML = htmlPerfilPreview(c);
        perfilEl.replaceWith(wrap.firstElementChild);
        atualizarResumoPreview();
        return;
      }
    }

    const blocosHtml = htmlBlocosPreview(c);
    root.innerHTML = `<div class="cartao shell--estreito">
      ${htmlPerfilPreview(c)}
      <div class="cartao__blocos">${blocosHtml}</div>
      <footer class="rodape"><p class="rodape__creditos"><span class="marca marca--compacta"><img src="/img/logo.png" alt="My Rep" width="28" height="28"></span></p></footer>
    </div>`;

    montarMapaPreview(root);
    atualizarResumoPreview();
  }

  function agendarPreview(tipo) {
    if (tipo === "blocos") {
      clearTimeout(previewBlocosTimer);
      previewBlocosTimer = setTimeout(() => atualizarPreview({ blocos: true }), 220);
      return;
    }
    if (previewRaf) return;
    previewRaf = requestAnimationFrame(() => {
      previewRaf = 0;
      atualizarPreview({ perfil: true });
    });
  }

  function aplicarPagina(pagina, opts) {
    if (!pagina) return;
    if (perfil) perfil.pagina = pagina;
    if (pagina.dados) paginaDados = pagina.dados;
    else {
      paginaDados = {
        ...(paginaDados || {}),
        marcas: pagina.marcas,
        catalogos: pagina.catalogos,
        foto: pagina.foto,
        fotoTipo: pagina.fotoTipo
      };
    }
    assetVersao = Date.now();
    if (pagina.marcas) renderMarcas(pagina.marcas);
    if (pagina.catalogos) renderCatalogos(pagina.catalogos, pagina.marcas || paginaDados.marcas);
    sincronizarFotoSalvaCampo();
    if (modoMarca && marcaAtualId) {
      const marca = marcaPorId(marcaAtualId);
      if (marca) {
        marcaAtual = marcasComSlugs([marca])[0];
        renderCatalogosMarca(marcaAtualId);
        if (!opts?.preservarFormulario) sincronizarLogoMarcaCampo(marcaAtual);
        atualizarPreviewMarca();
      }
    } else {
      atualizarPreview();
    }
    renderTrilha();
  }

  async function apiPagina(method, body, formData) {
    const opts = { method, headers: await authHeaders(!formData) };
    if (formData) opts.body = formData;
    else if (body) opts.body = JSON.stringify(body);
    const resp = await fetch("/api/painel/pagina", opts);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      if (resp.status === 413) {
        throw new Error("Arquivo grande demais. Use um PDF de até 100 MB.");
      }
      throw new Error(data.erro || "Falha ao salvar");
    }
    return data;
  }

  const MAX_CATALOGO = 100 * 1024 * 1024;
  const MAX_IMAGEM = 8 * 1024 * 1024;

  let campoArquivoBlobUrl = null;

  function revogarCampoArquivoBlob() {
    if (campoArquivoBlobUrl) {
      URL.revokeObjectURL(campoArquivoBlobUrl);
      campoArquivoBlobUrl = null;
    }
  }

  function limparArquivoCampo(input) {
    if (!input) return;
    input.value = "";
    revogarCampoArquivoBlob();
    const zona = input.closest(".campo-arquivo__zona");
    if (!zona) return;
    zona.classList.remove("is-preenchido", "is-dragover");
    const thumb = zona.querySelector(".campo-arquivo__thumb");
    const badge = zona.querySelector(".campo-arquivo__badge");
    const nomeEl = zona.querySelector(".campo-arquivo__nome");
    if (nomeEl) nomeEl.textContent = "";
    if (thumb) {
      thumb.hidden = true;
      thumb.removeAttribute("src");
      thumb.classList.remove("campo-arquivo__thumb--logo");
    }
    if (badge) badge.hidden = true;
    const preenchido = zona.querySelector(".campo-arquivo__preenchido");
    if (preenchido) preenchido.hidden = true;
  }

  function atualizarArquivoCampo(input, opts = {}) {
    if (!input) return;
    const file = opts.file;
    const nome = opts.nome || file?.name || "";
    let previewUrl = opts.previewUrl || "";

    if (!nome && !previewUrl && !file) {
      limparArquivoCampo(input);
      return;
    }

    if (file && !previewUrl && file.type?.startsWith("image/")) {
      revogarCampoArquivoBlob();
      previewUrl = URL.createObjectURL(file);
      campoArquivoBlobUrl = previewUrl;
    } else if (opts.previewUrl && !file) {
      revogarCampoArquivoBlob();
    }

    const zona = input.closest(".campo-arquivo__zona");
    const campo = input.closest(".campo-arquivo");
    if (!zona) return;

    const tipoCampo = campo?.dataset.tipo || "";
    const isPdf =
      file?.type === "application/pdf" ||
      /\.pdf$/i.test(nome) ||
      (tipoCampo === "pdf" && !!nome);
    const isImage =
      file?.type?.startsWith("image/") ||
      /\.(jpe?g|png|webp|gif|svg)$/i.test(nome) ||
      (tipoCampo === "imagem" && !!previewUrl && !isPdf);

    zona.classList.add("is-preenchido");
    const preenchido = zona.querySelector(".campo-arquivo__preenchido");
    const nomeEl = zona.querySelector(".campo-arquivo__nome");
    if (preenchido) preenchido.hidden = false;
    if (nomeEl) nomeEl.textContent = nome;

    const thumb = zona.querySelector(".campo-arquivo__thumb");
    const badge = zona.querySelector(".campo-arquivo__badge");

    if (thumb) {
      const mostrarThumb = isImage && previewUrl;
      thumb.hidden = !mostrarThumb;
      if (mostrarThumb) {
        thumb.src = previewUrl;
        const logoThumb =
          (input.id === "input-foto" &&
            document.querySelector('input[name="fotoTipo"]:checked')?.value === "logo") ||
          !!input.closest("#form-marca-add");
        thumb.classList.toggle("campo-arquivo__thumb--logo", logoThumb);
      } else {
        thumb.removeAttribute("src");
      }
    }

    if (badge) {
      if (tipoCampo === "pdf") {
        badge.hidden = false;
      } else if (tipoCampo === "anexo") {
        badge.hidden = !(isPdf && !isImage);
      } else {
        badge.hidden = true;
      }
    }
  }

  function initCamposArquivo(raiz = document) {
    raiz.querySelectorAll(".campo-arquivo").forEach((campo) => {
      const input = campo.querySelector(".campo-arquivo__input");
      const zona = campo.querySelector(".campo-arquivo__zona");
      const btnTrocar = campo.querySelector(".campo-arquivo__trocar");
      if (!input || !zona || input.dataset.arquivoInit) return;
      input.dataset.arquivoInit = "1";
      input.tabIndex = -1;
      zona.setAttribute("role", "button");
      if (!zona.getAttribute("aria-label") && !zona.getAttribute("aria-labelledby")) {
        const rotulo = campo.querySelector(".campo__rotulo");
        zona.setAttribute("aria-label", rotulo?.textContent?.trim() || "Enviar arquivo");
      }

      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) atualizarArquivoCampo(input, { file });
        else limparArquivoCampo(input);
      });

      btnTrocar?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        limparArquivoCampo(input);
        input.click();
      });

      ["dragenter", "dragover"].forEach((evName) => {
        zona.addEventListener(evName, (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          zona.classList.add("is-dragover");
        });
      });

      ["dragleave", "drop"].forEach((evName) => {
        zona.addEventListener(evName, (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          zona.classList.remove("is-dragover");
        });
      });

      zona.addEventListener("drop", (ev) => {
        const file = ev.dataTransfer?.files?.[0];
        if (!file) return;
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      zona.addEventListener("keydown", (ev) => {
        if (zona.classList.contains("is-preenchido")) return;
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          input.click();
        }
      });
    });
  }

  function sincronizarFotoSalvaCampo() {
    const inputFoto = document.getElementById("input-foto");
    if (!inputFoto) return;
    if (paginaDados?.foto) {
      inputFoto.value = "";
      revogarCampoArquivoBlob();
      atualizarArquivoCampo(inputFoto, {
        nome: String(paginaDados.foto).split("/").pop(),
        previewUrl: urlAsset(paginaDados.foto)
      });
      return;
    }
    if (!inputFoto.files?.[0]) limparArquivoCampo(inputFoto);
  }

  async function enviarArquivoStorage(file, tipo, dica) {
    const prep = await apiPagina("POST", {
      acao: "upload_url",
      tipo,
      nome: file.name,
      dica: dica || file.name.replace(/\.[^.]+$/, "")
    });
    const sb = window.MyRepAuth.getClient();
    const bucket = window.MYREP_SUPABASE?.storageBucket || "assets-clientes";
    const bucketApi = sb?.storage?.from(bucket);
    if (typeof bucketApi?.uploadToSignedUrl === "function") {
      const { error } = await bucketApi.uploadToSignedUrl(prep.path, prep.token, file, {
        contentType: file.type || undefined,
        upsert: true
      });
      if (error) throw new Error(error.message || "Falha no envio do arquivo.");
      return prep.arquivo;
    }
    const resp = await fetch(prep.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true"
      },
      body: file
    });
    if (!resp.ok) throw new Error("Falha no envio do arquivo.");
    return prep.arquivo;
  }

  function agendarSave() {
    agendarPreview();
    renderTrilha();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(salvarTexto, 800);
  }

  async function salvarTexto() {
    const status = document.getElementById("editor-status");
    setStatus(status, "Salvando…", "info");
    try {
      const data = await apiPagina("PUT", payloadTexto());
      if (perfil) perfil.pagina = data.pagina;
      paginaDados = data.pagina?.dados || paginaDados;
      setStatus(status, "Salvo.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  }

  async function midiaRequest(formData) {
    return apiPagina("POST", null, formData);
  }

  function renderVisibilidade() {
    if (modoMarca) {
      document.getElementById("secao-trilha")?.setAttribute("hidden", "");
      document.getElementById("secao-manual")?.setAttribute("hidden", "");
      document.getElementById("link-manual-topo")?.setAttribute("hidden", "");
      return;
    }

    document.getElementById("secao-trilha")?.removeAttribute("hidden");
    document.getElementById("secao-manual")?.removeAttribute("hidden");
    document.getElementById("link-manual-topo")?.removeAttribute("hidden");

    const ass = perfil?.assinatura;
    const pag = perfil?.pagina;
    const libera = assinaturaLibera(ass);
    const assinaturaVigente = ass?.status === "ativa";

    document.getElementById("painel-planos").hidden = !!(libera && assinaturaVigente);
    document.getElementById("assinatura-nota-anual")?.toggleAttribute(
      "hidden",
      !!(libera && assinaturaVigente)
    );
    document.getElementById("secao-assinatura")?.toggleAttribute("hidden", assinaturaVigente);
    document.getElementById("secao-url").hidden = !libera || !!pag?.slug;
    document.getElementById("secao-pagina").hidden = !pag?.slug;
    document.getElementById("secao-editor").hidden = !libera || !pag?.slug;
    document.getElementById("secao-suporte").hidden = !libera;
    document.getElementById("secao-pagina-marca")?.setAttribute("hidden", "");

    if (pag?.slug) {
      const href = urlAbsoluta(pag.url || `/${pag.slug}/`);
      document.getElementById("pagina-url-fixa").textContent = `/${pag.slug}/`;
      const link = document.getElementById("pagina-link");
      link.href = href;
      link.textContent = href.replace(/^https?:\/\//, "");
      document.getElementById("pagina-situacao").textContent = pag.publicado
        ? "Publicada e no ar"
        : "Rascunho — clique em Publicar para tornar visível";
      document.getElementById("btn-publicar").textContent = pag.publicado
        ? "Despublicar"
        : "Publicar página";
    }

    renderTrilha();
  }

  async function renderPerfil(data) {
    perfil = data;
    const user = data.user || {};
    const assinatura = data.assinatura;

    document.getElementById("painel-nome-saudacao").textContent = user.nome ? `, ${user.nome}` : "";
    document.getElementById("painel-email").textContent = user.email || "";

    const st = labelStatus(assinatura);
    const badge = document.getElementById("painel-badge-assinatura");
    badge.textContent = st.texto;
    badge.dataset.status = st.status;

    const assTexto = document.getElementById("assinatura-texto");
    if (!assinatura) {
      assTexto.textContent = "Escolha um plano para montar sua página.";
    } else if (assinatura.status === "pendente") {
      assTexto.textContent = `Plano ${assinatura.plano} — conclua o pagamento na Asaas.`;
    } else if (assinatura.status === "ativa") {
      if (assinatura.plano === "vitalicio") {
        assTexto.textContent = "Plano Vitalício ativo · sem cobranças.";
      } else {
        assTexto.textContent = `Plano ${assinatura.plano} ativo${
          assinatura.proxima_cobranca ? ` · próxima cobrança ${assinatura.proxima_cobranca}` : ""
        }.`;
      }
    } else if (assinatura.status === "inadimplente") {
      assTexto.textContent =
        "Pagamento em atraso. Regularize para manter a página no ar (carência de 3 dias).";
    } else {
      assTexto.textContent = `Status: ${assinatura.status}.`;
    }

    renderVisibilidade();

    if (data.pagina?.dados) {
      preencherEditor(data.pagina.dados);
    } else if (data.pagina) {
      await carregarPaginaCompleta();
    }

    if (modoMarca) iniciarModoMarca();
  }

  async function carregarPaginaCompleta() {
    try {
      const resp = await fetch("/api/painel/pagina", { headers: await authHeaders() });
      const data = await resp.json();
      if (data.ok && data.pagina) {
        perfil.pagina = data.pagina;
        preencherEditor(data.pagina.dados);
      }
    } catch {
      /* ignore */
    }
  }

  async function carregarSuporte() {
    try {
      const resp = await fetch("/api/painel/suporte", { headers: await authHeaders() });
      const data = await resp.json();
      if (!data.ok || !data.mensagens?.length) return;
      const hist = document.getElementById("suporte-historico");
      const lista = document.getElementById("lista-suporte");
      hist.hidden = false;
      lista.innerHTML = data.mensagens
        .map((m) => {
          const respHtml = (m.respostas || [])
            .map(
              (r) =>
                `<p class="painel-resposta painel-resposta--${r.autor}"><strong>${
                  r.autor === "admin" ? "Suporte" : "Você"
                }:</strong> ${esc(r.corpo)}</p>`
            )
            .join("");
          return `<li class="painel-suporte-item">
            <strong>${esc(m.assunto || "Suporte")}</strong>
            <span class="painel-card__meta">${new Date(m.created_at).toLocaleString("pt-BR")}</span>
            <p>${esc(m.corpo)}</p>
            ${respHtml}
          </li>`;
        })
        .join("");
    } catch {
      /* ignore */
    }
  }

  async function carregar() {
    try {
      await esperarAuth();
      const sessao = await window.MyRepAuth.sessaoAtual();
      if (!sessao) {
        location.replace(`/entrar/?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }
      const data = await window.MyRepAuth.apiPerfil();
      await renderPerfil(data);
      carregando.hidden = true;
      conteudo.hidden = false;
      btnSair.hidden = false;
      carregarSuporte();
    } catch (erro) {
      if (erro.status === 401) {
        location.replace("/entrar/?next=/painel/");
        return;
      }
      carregando.textContent = erro.message || "Não foi possível carregar.";
      carregando.dataset.tipo = "erro";
    }
  }

  document.getElementById("painel-planos")?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-checkout]");
    if (!btn) return;
    if (perfil?.assinatura?.status === "ativa") {
      return;
    }
    const status = document.getElementById("checkout-status");
    setStatus(status, "Gerando link…", "info");
    try {
      const resp = await fetch("/api/painel/checkout", {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({ plano: btn.getAttribute("data-checkout") })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.erro);
      location.href = data.linkPagamento;
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("form-slug")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const status = document.getElementById("slug-status");
    const slug = document.getElementById("input-slug")?.value?.trim();
    setStatus(status, "Reservando…", "info");
    try {
      const resp = await fetch("/api/painel/slug", {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({ slug })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.erro);
      perfil.pagina = data.pagina;
      renderVisibilidade();
      preencherEditor(data.pagina.dados);
      setStatus(status, data.aviso, "ok");
      focarProximoPassoTrilha();
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("input-slug")?.addEventListener("input", (ev) => {
    clearTimeout(slugTimer);
    const val = ev.target.value;
    slugTimer = setTimeout(async () => {
      const status = document.getElementById("slug-status");
      if (!val || val.length < 3) {
        setStatus(status, "", "");
        return;
      }
      try {
        const resp = await fetch(`/api/painel/slug?slug=${encodeURIComponent(val)}`, {
          headers: await authHeaders()
        });
        const data = await resp.json();
        if (data.disponivel) setStatus(status, `/${data.slug}/ está disponível`, "ok");
        else setStatus(status, data.motivo || "Indisponível", "erro");
      } catch {
        /* ignore */
      }
    }, 400);
  });

  ["campo-empresa", "campo-nome", "campo-cargo", "campo-bio", "campo-mensagem-zap", "campo-whatsapp-ddd", "campo-whatsapp-num", "campo-instagram"].forEach(
    (id) => document.getElementById(id)?.addEventListener("input", agendarSave)
  );

  document.getElementById("campo-segmentos")?.addEventListener("input", () => {
    agendarPreview("blocos");
    agendarSave();
  });

  document.querySelectorAll('input[name="destaque"]').forEach((el) => {
    el.addEventListener("change", agendarSave);
  });

  document.querySelectorAll('input[name="fotoTipo"]').forEach((el) => {
    el.addEventListener("change", () => {
      sincronizarFotoSalvaCampo();
      agendarSave();
    });
  });

  document.querySelectorAll('input[name="paleta"]').forEach((el) => {
    el.addEventListener("change", () => {
      atualizarPreview();
      agendarSave();
    });
  });

  document.getElementById("ufs-grid")?.addEventListener("change", async (ev) => {
    if (ev.target.type !== "checkbox") return;
    const estados = ufsSelecionadas();
    await renderCidadesEditor(estados, cidadesPorUf());
    agendarPreview("blocos");
    agendarSave();
  });

  document.getElementById("cidades-por-uf-editor")?.addEventListener("click", (ev) => {
    const trigger = ev.target.closest(".cidades-combobox__trigger");
    if (trigger) {
      ev.stopPropagation();
      const combobox = trigger.closest(".cidades-combobox");
      if (combobox?.classList.contains("cidades-combobox--aberto")) fecharComboboxAberto();
      else if (combobox) abrirCombobox(combobox);
      return;
    }
    if (!ev.target.closest(".cidades-combobox")) fecharComboboxAberto();
  });

  document.getElementById("cidades-por-uf-editor")?.addEventListener("input", (ev) => {
    const combobox = ev.target.closest(".cidades-combobox");
    if (ev.target.matches(".cidades-combobox__busca") && combobox) {
      filtrarListaCombobox(combobox, ev.target.value);
      return;
    }
    if (ev.target.matches('input[type="checkbox"][data-cidade-nome]') && combobox) {
      atualizarResumoCombobox(combobox);
      agendarPreview("blocos");
      agendarSave();
    }
  });

  document.getElementById("cidades-por-uf-editor")?.addEventListener("change", (ev) => {
    if (!ev.target.matches('input[type="checkbox"][data-cidade-nome]')) return;
    const combobox = ev.target.closest(".cidades-combobox");
    if (combobox) atualizarResumoCombobox(combobox);
    agendarPreview("blocos");
    agendarSave();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") fecharComboboxAberto();
  });

  document.addEventListener("click", (ev) => {
    if (comboboxAberto && !ev.target.closest(".cidades-combobox")) fecharComboboxAberto();
  });

  document.getElementById("input-foto")?.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const status = document.getElementById("editor-status");
    if (file.size > MAX_IMAGEM) {
      setStatus(status, "Imagem grande demais (máx. 8 MB).", "erro");
      return;
    }
    if (fotoLocalUrl) URL.revokeObjectURL(fotoLocalUrl);
    fotoLocalUrl = URL.createObjectURL(file);
    atualizarPreview({ perfil: true });
    setStatus(status, "Enviando foto…", "info");
    try {
      const arquivo = await enviarArquivoStorage(file, "foto");
      const data = await apiPagina("POST", {
        acao: "foto_set",
        arquivo,
        fotoTipo: document.querySelector('input[name="fotoTipo"]:checked')?.value || "pessoa"
      });
      if (fotoLocalUrl) {
        URL.revokeObjectURL(fotoLocalUrl);
        fotoLocalUrl = null;
      }
      aplicarPagina(data.pagina);
      setStatus(status, "Foto atualizada.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("form-catalogo-add")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const status = document.getElementById("editor-status");
    const form = ev.currentTarget;
    const titulo = form.titulo?.value?.trim() || "";
    const marcaId = form.marcaId?.value || "";
    const file = form.arquivo?.files?.[0];
    if (!file) {
      setStatus(status, "Escolha o arquivo PDF do catálogo.", "erro");
      return;
    }
    if (file.size > MAX_CATALOGO) {
      setStatus(status, "PDF grande demais (máx. 100 MB).", "erro");
      return;
    }
    setStatus(status, "Enviando catálogo…", "info");
    try {
      const arquivo = await enviarArquivoStorage(file, "catalogo", titulo || file.name);
      const data = await apiPagina("POST", {
        acao: "catalogo_add",
        titulo,
        marcaId,
        arquivo
      });
      aplicarPagina(data.pagina);
      form.reset();
      limparArquivoCampo(form.querySelector(".campo-arquivo__input"));
      setStatus(status, "Catálogo adicionado.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("form-marca-add")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const status = document.getElementById("editor-status");
    const form = ev.currentTarget;
    const nome = form.nome?.value?.trim() || "";
    const file = form.arquivo?.files?.[0];
    if (file && file.size > MAX_IMAGEM) {
      setStatus(status, "Logo grande demais (máx. 8 MB).", "erro");
      return;
    }
    setStatus(status, "Enviando marca…", "info");
    try {
      let arquivo = "";
      if (file) arquivo = await enviarArquivoStorage(file, "marca", nome);
      const body = {
        acao: "marca_add",
        nome
      };
      if (arquivo) body.arquivo = arquivo;
      const data = await apiPagina("POST", body);
      aplicarPagina(data.pagina);
      form.reset();
      limparArquivoCampo(form.querySelector(".campo-arquivo__input"));
      setStatus(status, "Marca adicionada.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("lista-catalogos")?.addEventListener("click", async (ev) => {
    const btnUp = ev.target.closest("[data-cat-up]");
    const btnDown = ev.target.closest("[data-cat-down]");
    const btn = ev.target.closest("[data-rm-catalogo]");
    const status = document.getElementById("editor-status");

    if (btnUp || btnDown) {
      const id = (btnUp || btnDown).getAttribute(btnUp ? "data-cat-up" : "data-cat-down");
      const dir = btnUp ? "up" : "down";
      const marcas = paginaDados.marcas || [];
      const novaOrdem = reordenarCatalogoNoGrupo(paginaDados.catalogos || [], marcas, id, dir);
      if (!novaOrdem) return;
      try {
        const data = await apiPagina("POST", {
          acao: "catalogo_reordenar",
          ordem: novaOrdem.map((c) => c.id)
        });
        aplicarPagina(data.pagina);
        setStatus(status, "Ordem dos catálogos atualizada.", "ok");
      } catch (erro) {
        setStatus(status, erro.message, "erro");
      }
      return;
    }

    if (!btn) return;
    const fd = new FormData();
    fd.append("acao", "catalogo_remover");
    fd.append("id", btn.getAttribute("data-rm-catalogo"));
    try {
      const data = await midiaRequest(fd);
      aplicarPagina(data.pagina);
      setStatus(status, "Catálogo removido.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("form-marca-pagina")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await salvarMarcaPagina();
  });

  ["marca-pagina-nome", "marca-pagina-descricao", "marca-pagina-site", "marca-pagina-contato"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", agendarSaveMarca);
  });

  document.getElementById("marca-pagina-logo")?.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const status = document.getElementById("marca-pagina-status");
    if (file.size > MAX_IMAGEM) {
      setStatus(status, "Logo grande demais (máx. 8 MB).", "erro");
      return;
    }
    if (marcaLogoLocalUrl) URL.revokeObjectURL(marcaLogoLocalUrl);
    marcaLogoLocalUrl = URL.createObjectURL(file);
    atualizarPreviewMarca();
    await salvarMarcaPagina();
  });

  document.getElementById("lista-marcas")?.addEventListener("click", async (ev) => {
    const btnUp = ev.target.closest("[data-marca-up]");
    const btnDown = ev.target.closest("[data-marca-down]");
    const btn = ev.target.closest("[data-rm-marca]");
    const status = document.getElementById("editor-status");

    if (btnUp || btnDown) {
      const id = (btnUp || btnDown).getAttribute(btnUp ? "data-marca-up" : "data-marca-down");
      const dir = btnUp ? "up" : "down";
      const novaOrdem = reordenarLista(paginaDados.marcas || [], id, dir);
      if (!novaOrdem) return;
      try {
        const data = await apiPagina("POST", {
          acao: "marca_reordenar",
          ordem: novaOrdem.map((m) => m.id)
        });
        aplicarPagina(data.pagina);
        setStatus(status, "Ordem das marcas atualizada.", "ok");
      } catch (erro) {
        setStatus(status, erro.message, "erro");
      }
      return;
    }

    if (!btn) return;
    const fd = new FormData();
    fd.append("acao", "marca_remover");
    fd.append("id", btn.getAttribute("data-rm-marca"));
    try {
      const data = await midiaRequest(fd);
      aplicarPagina(data.pagina);
      setStatus(status, "Marca removida.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("btn-publicar")?.addEventListener("click", async () => {
    const status = document.getElementById("compartilhar-status");
    const publicado = perfil?.pagina?.publicado;
    const fd = new FormData();
    fd.append("acao", publicado ? "despublicar" : "publicar");
    try {
      const data = await midiaRequest(fd);
      perfil.pagina = data.pagina;
      renderVisibilidade();
      setStatus(status, data.aviso, "ok");
      focarProximoPassoTrilha();
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("btn-compartilhar")?.addEventListener("click", async () => {
    const status = document.getElementById("compartilhar-status");
    const path = perfil?.pagina?.url || (perfil?.pagina?.slug ? `/${perfil.pagina.slug}/` : "");
    if (!path) return setStatus(status, "Página ainda não disponível.", "erro");
    const url = urlAbsoluta(path);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Meu cartão — My Rep", url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus(status, "Link copiado.", "ok");
      }
    } catch (e) {
      if (e?.name !== "AbortError") setStatus(status, "Não foi possível compartilhar.", "erro");
    }
  });

  document.getElementById("btn-copiar-link")?.addEventListener("click", async () => {
    const status = document.getElementById("compartilhar-status");
    const path = perfil?.pagina?.url || (perfil?.pagina?.slug ? `/${perfil.pagina.slug}/` : "");
    if (!path) return;
    try {
      await navigator.clipboard.writeText(urlAbsoluta(path));
      setStatus(status, "Link copiado.", "ok");
    } catch {
      setStatus(status, "Não foi possível copiar.", "erro");
    }
  });

  document.getElementById("form-suporte")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = document.getElementById("form-suporte");
    const status = document.getElementById("suporte-status");
    const btn = form?.querySelector('button[type="submit"]');
    if (!form) return;
    const fd = new FormData(form);
    if (btn) btn.disabled = true;
    setStatus(status, "Enviando…", "info");
    try {
      const resp = await fetch("/api/painel/suporte", {
        method: "POST",
        headers: { Authorization: `Bearer ${await window.MyRepAuth.accessToken()}` },
        body: fd
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.erro || "Não foi possível enviar.");
      const assunto = form.querySelector('[name="assunto"]');
      const mensagem = form.querySelector('[name="mensagem"]');
      if (assunto) assunto.value = "";
      if (mensagem) mensagem.value = "";
      limparArquivoCampo(form.querySelector(".campo-arquivo__input"));
      setStatus(status, "Mensagem enviada com sucesso. Responderemos em breve.", "ok");
      await carregarSuporte();
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  btnSair?.addEventListener("click", async () => {
    try {
      const sb = window.MyRepAuth.getClient();
      if (sb) await sb.auth.signOut();
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* ignore */
    }
    location.href = "/";
  });

  initAjudas();
  document.querySelectorAll("[data-abrir-manual]").forEach((el) => {
    el.addEventListener("click", abrirManual);
  });
  initCamposArquivo();
  carregar();
})();
