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

  function parseCidades(texto, estados) {
    const raw = limpar(texto);
    if (!raw) return estados.length === 1 ? [] : {};

    const temUf = /(?:^|\n)\s*[A-Za-z]{2}\s*:/.test(raw);
    if (estados.length === 1 && !temUf) return linhas(raw);

    const mapa = {};
    for (const linha of linhas(raw)) {
      const m = linha.match(/^([A-Za-z]{2})\s*:\s*(.+)$/);
      if (!m) continue;
      const uf = m[1].toUpperCase();
      mapa[uf] = m[2]
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
    }
    return mapa;
  }

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
    const estados = fd.getAll("estados").map((u) => String(u).toUpperCase());
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

    let telefones;
    let redes;
    try {
      telefones = coletarTelefones();
      redes = coletarRedes();
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
      cidades: parseCidades(fd.get("cidades"), estados),
      segmentos,
      catalogos,
      paleta: limpar(fd.get("paleta")) || "ambar"
    };

    const json = montarJson(dados, { foto: fotoNome });

    botao.disabled = true;
    setStatus("Montando pacote ZIP…", "info");

    try {
      const zipBlob = await montarZip(json, arquivosZip);

      if (zipBlob.size > 4 * 1024 * 1024) {
        throw new Error("Pacote acima de 4 MB. Reduza imagens/PDFs e tente de novo.");
      }

      setStatus("Enviando briefing…", "info");

      const corpo = new FormData();
      corpo.append("slug", slug);
      corpo.append("nome", nome);
      if (emails[0]) corpo.append("emailCliente", emails[0]);
      corpo.append("acesso", acessoToken || acessoInput?.value || "");
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

      form.reset();
      form.querySelector('input[name="paleta"][value="ambar"]').checked = true;
      form.querySelector('input[name="fotoTipo"][value="pessoa"]').checked = true;
      form.querySelector('input[name="destaque"][value="pessoa"]').checked = true;
      ["emails", "telefones", "redes", "segmentos"].forEach(resetLista);

      setStatus(
        payload.modo === "local"
          ? "Briefing salvo localmente em /inbox. Em produção o ZIP vai por e-mail."
          : "Briefing enviado! Em breve montamos sua página.",
        "ok"
      );
    } catch (erro) {
      setStatus(erro.message || "Não foi possível enviar. Tente novamente.", "erro");
    } finally {
      botao.disabled = false;
    }
  });
})();
