/* =========================================================
   briefing.js — monta JSON + ZIP e envia para /api/briefing
   ========================================================= */

(function () {
  const UFS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
    "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
  ];

  const MSG_WHATSAPP = "Olá, vim pela sua página do My Rep!";

  const REDES = [
    { id: "instagram", label: "Instagram" },
    { id: "linkedin", label: "LinkedIn" },
    { id: "facebook", label: "Facebook" },
    { id: "tiktok", label: "TikTok" },
    { id: "site", label: "Site" },
    { id: "outro", label: "Outra" }
  ];

  const form = document.getElementById("briefing-form");
  const statusEl = document.getElementById("briefing-status");
  const botao = document.getElementById("briefing-enviar");
  const ufsGrid = document.getElementById("ufs-grid");
  const gate = document.getElementById("briefing-gate");
  const gateTexto = document.getElementById("briefing-gate-texto");
  const acessoInput = document.getElementById("briefing-acesso");

  if (!form || !ufsGrid) return;

  const acessoUrl = new URLSearchParams(location.search).get("acesso") || "";
  let acessoToken = acessoUrl;

  async function garantirAcesso() {
    try {
      const resp = await fetch("/api/pagamento/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: acessoToken || "" })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) throw new Error(data.erro || "Acesso inválido");
      if (acessoInput) acessoInput.value = acessoToken;
      form.hidden = false;
      if (gate) gate.hidden = true;
      if (statusEl && data.modo !== "dev") {
        statusEl.textContent = `Acesso liberado · plano ${data.planoNome || data.plano}`;
        statusEl.dataset.tipo = "ok";
      }
      return true;
    } catch (erro) {
      form.hidden = true;
      if (gate) {
        gate.hidden = false;
        if (gateTexto) {
          gateTexto.textContent = acessoToken
            ? erro.message || "Pagamento necessário."
            : "Para preencher o briefing, escolha um plano e pague na Asaas. Depois libere o acesso com o e-mail do pagamento.";
        }
      }
      return false;
    }
  }

  garantirAcesso().then((ok) => {
    if (!ok) return;
  });

  ufsGrid.innerHTML = UFS.map(
    (uf) =>
      `<label class="opcao opcao--uf"><input type="checkbox" name="estados" value="${uf}"> ${uf}</label>`
  ).join("");

  ufsGrid.addEventListener("change", () => syncCidadesUi());

  const limpar = (s) => String(s || "").trim();
  const soDigitos = (s) => String(s || "").replace(/\D/g, "");
  const slugOk = (s) => /^[a-z0-9-]+$/.test(s);

  const slugify = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

  const linhas = (s) =>
    limpar(s)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

  const extArquivo = (nome, fallback) => {
    const m = String(nome || "").match(/(\.[a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : fallback;
  };

  const nomeSeguro = (nome) =>
    String(nome || "arquivo")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "arquivo";

  function formatarTelefone(ddd, numero) {
    const n = soDigitos(numero);
    if (n.length === 9) return `(${ddd}) ${n.slice(0, 5)}-${n.slice(5)}`;
    if (n.length === 8) return `(${ddd}) ${n.slice(0, 4)}-${n.slice(4)}`;
    return `(${ddd}) ${n}`;
  }

  function linkRede(tipo, valor) {
    const v = limpar(valor);
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    const handle = v.replace(/^@/, "");
    if (tipo === "instagram") return `https://instagram.com/${handle}`;
    if (tipo === "linkedin") {
      if (handle.includes("linkedin.com")) return `https://${handle.replace(/^https?:\/\//i, "")}`;
      return `https://www.linkedin.com/in/${handle}`;
    }
    if (tipo === "facebook") return `https://facebook.com/${handle}`;
    if (tipo === "tiktok") return `https://www.tiktok.com/@${handle}`;
    if (tipo === "site") return v.includes(".") ? `https://${v.replace(/^https?:\/\//i, "")}` : "";
    return v.includes(".") ? `https://${v.replace(/^https?:\/\//i, "")}` : v;
  }

  function cidadesUnicas(lista) {
    const vistos = new Set();
    const out = [];
    for (const item of lista) {
      const nome = limpar(item);
      if (!nome) continue;
      const chave = nome.toLocaleLowerCase("pt-BR");
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      out.push(nome);
    }
    return out;
  }

  function partirCidades(trecho) {
    return String(trecho || "")
      .split(/[,;|/]+/)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  /** Interpreta o textarea livre (1 UF ou texto com prefixo UF:). */
  function parseCidadesTexto(texto, estados) {
    const raw = limpar(texto);
    if (!raw) return estados.length === 1 ? [] : {};

    const mapa = {};
    const orfas = [];
    const ufsValidas = new Set(UFS);

    for (const linha of linhas(raw)) {
      let m = linha.match(/^([A-Za-z]{2})\s*[:\-–—]\s*(.+)$/);
      if (!m) {
        const mEspaco = linha.match(/^([A-Za-z]{2})\s+(.+)$/);
        if (mEspaco && ufsValidas.has(mEspaco[1].toUpperCase())) m = mEspaco;
      }

      if (m) {
        const uf = m[1].toUpperCase();
        if (!mapa[uf]) mapa[uf] = [];
        mapa[uf].push(...partirCidades(m[2]));
        continue;
      }

      orfas.push(...partirCidades(linha));
    }

    for (const uf of Object.keys(mapa)) {
      mapa[uf] = cidadesUnicas(mapa[uf]);
    }

    if (estados.length === 1) {
      return cidadesUnicas([...Object.values(mapa).flat(), ...orfas]);
    }

    if (orfas.length) {
      throw new Error(
        "Com vários estados, use o campo de cada UF ou o formato BA: Salvador, Camaçari."
      );
    }

    const selecionadas = new Set(estados);
    const extras = Object.keys(mapa).filter((uf) => mapa[uf].length && !selecionadas.has(uf));
    if (extras.length) {
      throw new Error(`Há cidades em UF não marcada: ${extras.join(", ")}.`);
    }

    const filtrado = {};
    for (const uf of estados) {
      if (mapa[uf]?.length) filtrado[uf] = mapa[uf];
    }
    return filtrado;
  }

  function estadosSelecionados() {
    return [...form.querySelectorAll('input[name="estados"]:checked')].map((el) =>
      String(el.value).toUpperCase()
    );
  }

  function syncCidadesUi() {
    const unicaWrap = document.getElementById("cidades-unica-wrap");
    const unica = document.getElementById("cidades-unica");
    const porUf = document.getElementById("cidades-por-uf");
    const ajuda = document.getElementById("cidades-ajuda");
    if (!unicaWrap || !unica || !porUf) return;

    const estados = estadosSelecionados();

    if (estados.length <= 1) {
      if (!porUf.hidden) {
        const juntadas = [...porUf.querySelectorAll("textarea[data-uf]")]
          .flatMap((el) => partirCidades(linhas(el.value).join(",")))
          .filter(Boolean);
        if (juntadas.length && !limpar(unica.value)) {
          unica.value = cidadesUnicas(juntadas).join("\n");
        }
      }
      porUf.hidden = true;
      porUf.innerHTML = "";
      unicaWrap.hidden = false;
      if (ajuda) {
        ajuda.textContent =
          estados.length === 1
            ? `Cidades em ${estados[0]}: uma por linha ou separadas por vírgula. Vazio = estado inteiro.`
            : "Selecione os estados e informe as cidades. Vazio = estado inteiro.";
      }
      return;
    }

    const prev = {};
    porUf.querySelectorAll("textarea[data-uf]").forEach((el) => {
      prev[el.dataset.uf] = el.value;
    });
    if (!Object.keys(prev).length && limpar(unica.value)) {
      try {
        const parseado = parseCidadesTexto(unica.value, estados);
        if (parseado && typeof parseado === "object" && !Array.isArray(parseado)) {
          for (const [uf, lista] of Object.entries(parseado)) {
            prev[uf] = (lista || []).join("\n");
          }
        } else if (Array.isArray(parseado) && parseado.length) {
          prev[estados[0]] = parseado.join("\n");
        } else if (limpar(unica.value)) {
          prev[estados[0]] = unica.value;
        }
      } catch {
        prev[estados[0]] = unica.value;
      }
    }

    unicaWrap.hidden = true;
    porUf.hidden = false;
    porUf.replaceChildren();
    for (const uf of estados) {
      const label = document.createElement("label");
      label.className = "campo";
      const rotulo = document.createElement("span");
      rotulo.className = "campo__rotulo";
      rotulo.textContent = `Cidades em ${uf}`;
      const ta = document.createElement("textarea");
      ta.dataset.uf = uf;
      ta.name = `cidades_${uf}`;
      ta.rows = 2;
      ta.placeholder = "Uma por linha ou separadas por vírgula";
      if (prev[uf]) ta.value = prev[uf];
      label.append(rotulo, ta);
      porUf.append(label);
    }
    if (ajuda) {
      ajuda.textContent =
        "Com vários estados, preencha as cidades em cada UF. Vazio numa UF = estado inteiro.";
    }
  }

  function coletarCidades(estados) {
    if (!estados.length) return {};

    const porUfEl = document.getElementById("cidades-por-uf");
    if (estados.length > 1 && porUfEl && !porUfEl.hidden) {
      const mapa = {};
      for (const uf of estados) {
        const el = porUfEl.querySelector(`textarea[data-uf="${uf}"]`);
        const lista = cidadesUnicas(linhas(el?.value).flatMap(partirCidades));
        if (lista.length) mapa[uf] = lista;
      }
      return mapa;
    }

    const unica = document.getElementById("cidades-unica");
    return parseCidadesTexto(unica?.value || "", estados);
  }

  syncCidadesUi();

  function casarLogo(nomeMarca, arquivos) {
    const chave = nomeSeguro(nomeMarca).replace(/^marca-/, "");
    return (
      arquivos.find((f) => {
        const n = nomeSeguro(f.name).replace(/\.[^.]+$/, "");
        return n === chave || n === `marca-${chave}` || n.includes(chave);
      }) || null
    );
  }

  function setStatus(msg, tipo) {
    statusEl.textContent = msg || "";
    statusEl.dataset.tipo = tipo || "";
  }

  /* ---------- listas dinâmicas ---------- */

  function itemEmail() {
    return `<div class="lista-dinamica__item">
      <input name="emails[]" type="email" maxlength="160" placeholder="voce@empresa.com.br" autocomplete="email">
      <button type="button" class="btn-remover" data-remover aria-label="Remover e-mail">×</button>
    </div>`;
  }

  function itemTelefone() {
    return `<div class="lista-dinamica__item lista-dinamica__item--fone">
      <div class="fone-linha">
        <span class="fone-ddi" aria-hidden="true">+55</span>
        <input name="telDdd[]" type="tel" inputmode="numeric" maxlength="2" placeholder="DDD">
        <input name="telNumero[]" type="tel" inputmode="numeric" maxlength="9" placeholder="Número" class="fone-parte--numero">
      </div>
      <button type="button" class="btn-remover" data-remover aria-label="Remover telefone">×</button>
    </div>`;
  }

  function itemRede() {
    const opts = REDES.map((r) => `<option value="${r.id}">${r.label}</option>`).join("");
    return `<div class="lista-dinamica__item lista-dinamica__item--rede">
      <select name="redeTipo[]">${opts}</select>
      <input name="redeValor[]" type="text" maxlength="200" placeholder="@usuario ou URL">
      <button type="button" class="btn-remover" data-remover aria-label="Remover rede">×</button>
    </div>`;
  }

  function itemSegmento() {
    return `<div class="lista-dinamica__item">
      <input name="segmentos[]" type="text" maxlength="80" placeholder="Ex.: Insumos agrícolas">
      <button type="button" class="btn-remover" data-remover aria-label="Remover segmento">×</button>
    </div>`;
  }

  const FABRICAS = {
    emails: itemEmail,
    telefones: itemTelefone,
    redes: itemRede,
    segmentos: itemSegmento
  };

  function listaEl(nome) {
    return document.getElementById(`lista-${nome}`);
  }

  function adicionarItem(nome) {
    const el = listaEl(nome);
    const fab = FABRICAS[nome];
    if (!el || !fab) return;
    el.insertAdjacentHTML("beforeend", fab());
    atualizarRemover(el);
  }

  function resetLista(nome) {
    const el = listaEl(nome);
    if (!el) return;
    el.innerHTML = "";
    adicionarItem(nome);
  }

  function atualizarRemover(lista) {
    const itens = lista.querySelectorAll(".lista-dinamica__item");
    itens.forEach((item) => {
      const btn = item.querySelector("[data-remover]");
      if (!btn) return;
      btn.hidden = itens.length <= 1;
    });
  }

  ["emails", "telefones", "redes", "segmentos"].forEach(resetLista);

  form.addEventListener("click", (evento) => {
    const add = evento.target.closest("[data-add]");
    if (add) {
      adicionarItem(add.getAttribute("data-add"));
      return;
    }
    const rem = evento.target.closest("[data-remover]");
    if (rem) {
      const item = rem.closest(".lista-dinamica__item");
      const lista = rem.closest(".lista-dinamica");
      if (item && lista && lista.querySelectorAll(".lista-dinamica__item").length > 1) {
        item.remove();
        atualizarRemover(lista);
      }
    }
  });

  function coletarEmails() {
    return [...form.querySelectorAll('input[name="emails[]"]')]
      .map((i) => limpar(i.value))
      .filter(Boolean);
  }

  function coletarTelefones() {
    const ddds = [...form.querySelectorAll('input[name="telDdd[]"]')];
    const nums = [...form.querySelectorAll('input[name="telNumero[]"]')];
    const out = [];
    for (let i = 0; i < ddds.length; i++) {
      const ddd = soDigitos(ddds[i].value);
      const numero = soDigitos(nums[i] ? nums[i].value : "");
      if (!ddd && !numero) continue;
      if (ddd.length !== 2 || (numero.length !== 8 && numero.length !== 9)) {
        throw new Error("Telefone extra inválido. Use DDD (2 dígitos) e número (8 ou 9).");
      }
      out.push({ ddd, numero });
    }
    return out;
  }

  function coletarRedes() {
    const tipos = [...form.querySelectorAll('select[name="redeTipo[]"]')];
    const valores = [...form.querySelectorAll('input[name="redeValor[]"]')];
    const out = [];
    for (let i = 0; i < tipos.length; i++) {
      const valor = limpar(valores[i] ? valores[i].value : "");
      if (!valor) continue;
      const tipo = tipos[i].value;
      const label = REDES.find((r) => r.id === tipo)?.label || "Rede";
      const link = linkRede(tipo, valor);
      if (!link) throw new Error(`Informe um @ ou URL válido para ${label}.`);
      out.push({ canal: label, valor, link });
    }
    return out;
  }

  function coletarSegmentos() {
    return [...form.querySelectorAll('input[name="segmentos[]"]')]
      .map((i) => limpar(i.value))
      .filter(Boolean);
  }

  function montarJson(dados, nomesArquivos) {
    const contatos = [];

    for (const email of dados.emails) {
      contatos.push({ canal: "E-mail", valor: email, link: `mailto:${email}` });
    }
    for (const tel of dados.telefones) {
      contatos.push({
        canal: "Telefone",
        valor: formatarTelefone(tel.ddd, tel.numero),
        link: `tel:+55${tel.ddd}${tel.numero}`
      });
    }
    for (const rede of dados.redes) {
      contatos.push(rede);
    }

    const json = {
      slug: dados.slug,
      nome: dados.nome,
      whatsapp: dados.whatsapp,
      mensagemWhatsapp: MSG_WHATSAPP,
      paleta: dados.paleta,
      destaque: dados.destaque
    };

    if (dados.empresa) json.empresa = dados.empresa;
    if (dados.cargo) json.cargo = dados.cargo;
    if (dados.bio) json.bio = dados.bio;
    if (nomesArquivos.foto) {
      json.foto = nomesArquivos.foto;
      json.fotoTipo = dados.fotoTipo;
    }
    if (dados.marcas.length) json.marcas = dados.marcas;
    if (dados.estados.length) json.estados = dados.estados;
    if (
      dados.cidades != null &&
      (Array.isArray(dados.cidades) ? dados.cidades.length : Object.keys(dados.cidades).length)
    ) {
      json.cidades = dados.cidades;
    }
    if (dados.segmentos.length) json.segmentos = dados.segmentos.join(" · ");
    if (dados.catalogos.length) json.catalogos = dados.catalogos;
    if (contatos.length) json.contatos = contatos;

    return json;
  }

  async function montarZip(json, arquivos) {
    if (typeof JSZip === "undefined") {
      throw new Error("Biblioteca de ZIP não carregou. Recarregue a página.");
    }

    const zip = new JSZip();
    const slug = json.slug;
    zip.file(`clientes/${slug}.json`, JSON.stringify(json, null, 2));

    const pasta = zip.folder(`assets-clientes/${slug}`);
    for (const item of arquivos) {
      pasta.file(item.nome, item.blob);
    }

    return zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
  }

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    setStatus("");

    if (!(await garantirAcesso())) {
      return setStatus("Pagamento necessário antes de enviar o briefing.", "erro");
    }

    const fd = new FormData(form);
    const nome = limpar(fd.get("nome"));
    const empresa = limpar(fd.get("empresa"));
    const destaque = fd.get("destaque") === "empresa" ? "empresa" : "pessoa";
    const baseSlug = destaque === "empresa" ? empresa : nome;
    const slug = slugify(baseSlug);
    const ddd = soDigitos(fd.get("whatsappDdd"));
    const numeroZap = soDigitos(fd.get("whatsappNumero"));
    const whatsapp = `55${ddd}${numeroZap}`;
    const estados = estadosSelecionados();
    const fotoFile = fd.get("foto");

    if (!nome) return setStatus("Informe seu nome completo.", "erro");
    if (destaque === "empresa" && !empresa) {
      return setStatus("Informe o nome da representada para colocá-la em evidência.", "erro");
    }
    if (!slugOk(slug)) {
      return setStatus("Não foi possível gerar a URL a partir do nome escolhido. Use letras e números.", "erro");
    }
    if (ddd.length !== 2) return setStatus("Informe o DDD do WhatsApp (2 dígitos).", "erro");
    if (numeroZap.length !== 8 && numeroZap.length !== 9) {
      return setStatus("Informe o número do WhatsApp (8 ou 9 dígitos).", "erro");
    }
    if (!estados.length) return setStatus("Selecione ao menos um estado.", "erro");
    if (!(fotoFile instanceof File) || !fotoFile.size) {
      return setStatus("Envie a foto ou logo do perfil.", "erro");
    }
    if (!form.elements.aceiteTermos?.checked) {
      return setStatus("Aceite os termos de uso para enviar o briefing.", "erro");
    }

    let telefones;
    let redes;
    let cidades;
    try {
      telefones = coletarTelefones();
      redes = coletarRedes();
      cidades = coletarCidades(estados);
    } catch (erro) {
      return setStatus(erro.message, "erro");
    }

    const emails = coletarEmails();
    const segmentos = coletarSegmentos();

    const fotoNome = `foto${extArquivo(fotoFile.name, ".jpg")}`;
    const logosFiles = [...(form.elements.logosMarcas?.files || [])];
    const catalogoFiles = [...(form.elements.catalogos?.files || [])];
    const nomesMarcas = linhas(fd.get("marcas"));

    const arquivosZip = [{ nome: fotoNome, blob: fotoFile }];
    const marcas = nomesMarcas.map((marcaNome) => {
      const logo = casarLogo(marcaNome, logosFiles);
      if (!logo) return { nome: marcaNome };
      const nomeArquivo = nomeSeguro(logo.name);
      if (!arquivosZip.some((a) => a.nome === nomeArquivo)) {
        arquivosZip.push({ nome: nomeArquivo, blob: logo });
      }
      return { nome: marcaNome, logo: nomeArquivo };
    });

    for (const logo of logosFiles) {
      const nomeArquivo = nomeSeguro(logo.name);
      if (!arquivosZip.some((a) => a.nome === nomeArquivo)) {
        arquivosZip.push({ nome: nomeArquivo, blob: logo });
      }
    }

    const catalogos = catalogoFiles.map((arquivo) => {
      const nomeArquivo = nomeSeguro(arquivo.name).endsWith(".pdf")
        ? nomeSeguro(arquivo.name)
        : `${nomeSeguro(arquivo.name)}.pdf`;
      arquivosZip.push({ nome: nomeArquivo, blob: arquivo });
      return {
        titulo: arquivo.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim() || "Catálogo",
        arquivo: nomeArquivo,
        tipo: "PDF"
      };
    });

    const dados = {
      empresa,
      nome,
      destaque,
      cargo: limpar(fd.get("cargo")),
      bio: limpar(fd.get("bio")),
      slug,
      whatsapp,
      emails,
      telefones,
      redes,
      fotoTipo: fd.get("fotoTipo") === "logo" ? "logo" : "pessoa",
      marcas,
      estados,
      cidades,
      segmentos,
      catalogos,
      paleta: limpar(fd.get("paleta")) || "ambar"
    };

    const json = montarJson(dados, { foto: fotoNome });

    botao.disabled = true;
    setStatus("Montando pacote ZIP…", "info");

    try {
      const zipBlob = await montarZip(json, arquivosZip);

      if (zipBlob.size > 25 * 1024 * 1024) {
        throw new Error("Pacote acima de 25 MB. Reduza imagens/PDFs e tente de novo.");
      }

      setStatus("Enviando briefing…", "info");

      const corpo = new FormData();
      corpo.append("slug", slug);
      corpo.append("nome", nome);
      if (emails[0]) corpo.append("emailCliente", emails[0]);
      corpo.append("acesso", acessoToken || acessoInput?.value || "");
      corpo.append("aceiteTermos", "1");
      corpo.append("zip", zipBlob, `${slug}-myrep.zip`);

      const resp = await fetch("/api/briefing", {
        method: "POST",
        body: corpo
      });

      let payload = {};
      try {
        payload = await resp.json();
      } catch {
        payload = {};
      }

      if (!resp.ok) {
        throw new Error(payload.erro || `Falha no envio (${resp.status}).`);
      }

      location.href = "/briefing/ok/";
      return;
    } catch (erro) {
      setStatus(erro.message || "Não foi possível enviar. Tente novamente.", "erro");
    } finally {
      botao.disabled = false;
    }
  });
})();
