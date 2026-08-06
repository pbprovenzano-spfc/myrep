/* =========================================================
   painel.js — área do cliente autenticado
   ========================================================= */

(function () {
  const carregando = document.getElementById("painel-carregando");
  const conteudo = document.getElementById("painel-conteudo");
  const btnSair = document.getElementById("btn-sair");
  const params = new URLSearchParams(location.search);
  const planoUrl = params.get("plano") || "";

  let perfil = null;

  function setStatus(el, msg, tipo) {
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.tipo = tipo || "";
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

  function labelStatus(assinatura) {
    if (!assinatura) return { texto: "Sem assinatura", status: "pendente" };
    const mapa = {
      ativa: "Adimplente",
      inadimplente: "Inadimplente",
      cancelada: "Cancelada",
      pendente: "Pagamento pendente"
    };
    return {
      texto: mapa[assinatura.status] || assinatura.status,
      status: assinatura.status
    };
  }

  function renderMidia(pagina) {
    const secao = document.getElementById("secao-midia");
    const listaCat = document.getElementById("lista-catalogos");
    const listaMar = document.getElementById("lista-marcas");
    if (!pagina || !pagina.publicado) {
      if (secao) secao.hidden = true;
      return;
    }
    if (secao) secao.hidden = false;

    const cats = pagina.catalogos || [];
    const marcas = pagina.marcas || [];
    if (listaCat) {
      listaCat.innerHTML = cats.length
        ? cats
            .map(
              (c) =>
                `<li><span>${esc(c.titulo || c.arquivo)}</span>
                <button type="button" class="btn-link" data-rm-catalogo="${esc(c.arquivo || c.titulo)}">Remover</button></li>`
            )
            .join("")
        : "<li class='painel-lista__vazio'>Nenhum catálogo ainda.</li>";
    }
    if (listaMar) {
      listaMar.innerHTML = marcas.length
        ? marcas
            .map(
              (m) =>
                `<li><span>${esc(m.nome)}</span>
                <button type="button" class="btn-link" data-rm-marca="${esc(m.nome)}">Remover</button></li>`
            )
            .join("")
        : "<li class='painel-lista__vazio'>Nenhuma marca ainda.</li>";
    }
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPerfil(data) {
    perfil = data;
    const user = data.user || {};
    const assinatura = data.assinatura;
    const pagina = data.pagina;

    const saudacao = document.getElementById("painel-nome-saudacao");
    const emailEl = document.getElementById("painel-email");
    const badge = document.getElementById("painel-badge-assinatura");
    const assTexto = document.getElementById("assinatura-texto");
    const planos = document.getElementById("painel-planos");

    if (saudacao) {
      saudacao.textContent = user.nome ? `, ${user.nome}` : "";
    }
    if (emailEl) emailEl.textContent = user.email || "";

    const st = labelStatus(assinatura);
    if (badge) {
      badge.textContent = st.texto;
      badge.dataset.status = st.status;
    }

    const libera = assinatura && (assinatura.status === "ativa" || assinatura.status === "inadimplente");
    if (assTexto) {
      if (!assinatura) {
        assTexto.textContent = "Escolha um plano para liberar o briefing e publicar seu cartão.";
      } else if (assinatura.status === "pendente") {
        assTexto.textContent = `Plano ${assinatura.plano} selecionado — conclua o pagamento na Asaas.`;
      } else if (assinatura.status === "ativa") {
        assTexto.textContent = `Plano ${assinatura.plano} ativo${
          assinatura.proxima_cobranca ? ` · próxima cobrança ${assinatura.proxima_cobranca}` : ""
        }.`;
      } else if (assinatura.status === "inadimplente") {
        assTexto.textContent =
          "Pagamento em atraso. Regularize na Asaas para manter a página no ar (carência de 3 dias).";
      } else {
        assTexto.textContent = `Status: ${assinatura.status}. Escolha um plano para reativar.`;
      }
    }
    if (planos) {
      planos.hidden = !!(libera && assinatura.status === "ativa");
    }

    const sem = document.getElementById("pagina-sem");
    const com = document.getElementById("pagina-com");
    if (pagina && pagina.slug) {
      if (sem) sem.hidden = true;
      if (com) com.hidden = false;
      const link = document.getElementById("pagina-link");
      const sit = document.getElementById("pagina-situacao");
      const href = urlAbsoluta(pagina.url || `/${pagina.slug}/`);
      if (link) {
        link.href = href;
        link.textContent = href.replace(/^https?:\/\//, "");
      }
      if (sit) {
        sit.textContent = pagina.situacaoLabel || (pagina.publicado ? "Publicada" : "Aguardando publicação");
      }
    } else {
      if (sem) sem.hidden = false;
      if (com) com.hidden = true;
    }

    renderMidia(pagina);

    const formBriefing = document.getElementById("briefing-form");
    const gateBriefing = document.getElementById("briefing-gate-painel");
    const ajuda = document.getElementById("briefing-ajuda");
    if (data.briefingEnviado && ajuda) {
      ajuda.textContent =
        "Briefing já enviado. Se precisar mudar algo, use “Solicitar alteração manual” ou atualize catálogos/logos acima.";
    }
    if (libera) {
      if (formBriefing && !data.briefingEnviado) formBriefing.hidden = false;
      if (gateBriefing) gateBriefing.hidden = true;
    } else {
      if (formBriefing) formBriefing.hidden = true;
      if (gateBriefing) gateBriefing.hidden = false;
    }

    if (params.get("briefing") === "ok") {
      setStatus(document.getElementById("briefing-status"), "Briefing enviado com sucesso.", "ok");
    }
  }

  async function carregar() {
    try {
      await esperarAuth();
      const sessao = await window.MyRepAuth.sessaoAtual();
      if (!sessao) {
        location.replace(`/entrar/?next=${encodeURIComponent("/painel/" + location.search)}`);
        return;
      }
      const data = await window.MyRepAuth.apiPerfil();
      renderPerfil(data);
      if (carregando) carregando.hidden = true;
      if (conteudo) conteudo.hidden = false;
      if (btnSair) btnSair.hidden = false;

      if (planoUrl && (!data.assinatura || data.assinatura.status === "pendente" || data.assinatura.status === "cancelada")) {
        // auto-checkout opcional via query
      }
    } catch (erro) {
      if (erro.status === 401) {
        location.replace(`/entrar/?next=${encodeURIComponent("/painel/")}`);
        return;
      }
      if (carregando) {
        carregando.textContent = erro.message || "Não foi possível carregar o painel.";
        carregando.dataset.tipo = "erro";
      }
    }
  }

  async function checkout(plano) {
    const status = document.getElementById("checkout-status");
    setStatus(status, "Gerando link de pagamento…", "info");
    try {
      const resp = await fetch("/api/painel/checkout", {
        method: "POST",
        headers: await window.MyRepAuth.headersAuth(true),
        body: JSON.stringify({ plano })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.erro || "Falha no checkout");
      setStatus(status, "Redirecionando para a Asaas…", "ok");
      location.href = data.linkPagamento;
    } catch (erro) {
      setStatus(status, erro.message || "Erro ao abrir pagamento.", "erro");
    }
  }

  document.getElementById("painel-planos")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-checkout]");
    if (!btn) return;
    checkout(btn.getAttribute("data-checkout"));
  });

  if (planoUrl) {
    document.addEventListener("DOMContentLoaded", () => {
      /* aguarda perfil; se já logado e sem assinatura ativa, usuário clica */
    });
  }

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

  async function compartilhar() {
    const status = document.getElementById("compartilhar-status");
    const path = perfil?.pagina?.url || (perfil?.pagina?.slug ? `/${perfil.pagina.slug}/` : "");
    if (!path) return setStatus(status, "Página ainda não disponível.", "erro");
    const url = urlAbsoluta(path);
    const titulo = "Meu cartão de representante — My Rep";
    const texto = "Confira meu cartão de representante:";
    try {
      if (navigator.share) {
        await navigator.share({ title: titulo, text: texto, url });
        setStatus(status, "Compartilhado.", "ok");
      } else {
        await navigator.clipboard.writeText(url);
        setStatus(status, "Link copiado.", "ok");
      }
    } catch (erro) {
      if (erro?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setStatus(status, "Link copiado.", "ok");
      } catch {
        setStatus(status, "Copie o link manualmente: " + url, "erro");
      }
    }
  }

  document.getElementById("btn-compartilhar")?.addEventListener("click", compartilhar);
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

  async function midiaRequest(formData) {
    const resp = await fetch("/api/painel/pagina", {
      method: "POST",
      headers: { Authorization: `Bearer ${await window.MyRepAuth.accessToken()}` },
      body: formData
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.erro || "Falha ao salvar");
    return data;
  }

  document.getElementById("form-catalogo-add")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const status = document.getElementById("midia-status");
    const form = ev.currentTarget;
    const fd = new FormData(form);
    fd.append("acao", "catalogo_add");
    setStatus(status, "Enviando catálogo…", "info");
    try {
      const data = await midiaRequest(fd);
      form.reset();
      if (perfil) perfil.pagina = data.pagina;
      renderMidia(data.pagina);
      setStatus(status, data.aviso || "Catálogo adicionado.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("form-marca-add")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const status = document.getElementById("midia-status");
    const form = ev.currentTarget;
    const fd = new FormData(form);
    fd.append("acao", "marca_add");
    setStatus(status, "Enviando marca…", "info");
    try {
      const data = await midiaRequest(fd);
      form.reset();
      if (perfil) perfil.pagina = data.pagina;
      renderMidia(data.pagina);
      setStatus(status, data.aviso || "Marca adicionada.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("lista-catalogos")?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-rm-catalogo]");
    if (!btn) return;
    const status = document.getElementById("midia-status");
    const fd = new FormData();
    fd.append("acao", "catalogo_remover");
    fd.append("arquivo", btn.getAttribute("data-rm-catalogo"));
    try {
      const data = await midiaRequest(fd);
      if (perfil) perfil.pagina = data.pagina;
      renderMidia(data.pagina);
      setStatus(status, "Catálogo removido.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("lista-marcas")?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-rm-marca]");
    if (!btn) return;
    const status = document.getElementById("midia-status");
    const fd = new FormData();
    fd.append("acao", "marca_remover");
    fd.append("nome", btn.getAttribute("data-rm-marca"));
    try {
      const data = await midiaRequest(fd);
      if (perfil) perfil.pagina = data.pagina;
      renderMidia(data.pagina);
      setStatus(status, "Marca removida.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  document.getElementById("form-alteracao-painel")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const status = document.getElementById("alteracao-status");
    const form = ev.currentTarget;
    const fd = new FormData(form);
    if (perfil?.pagina?.slug) fd.append("slug", perfil.pagina.slug);
    const msg = String(fd.get("mensagem") || "").trim();
    const tel = String(fd.get("telefone") || "").trim();
    const arq = fd.get("anexo");
    if (msg.length < 3 && !tel && !(arq instanceof File && arq.size)) {
      return setStatus(status, "Descreva o pedido ou deixe um telefone.", "erro");
    }
    setStatus(status, "Enviando…", "info");
    try {
      const resp = await fetch("/api/painel/alteracoes", {
        method: "POST",
        headers: { Authorization: `Bearer ${await window.MyRepAuth.accessToken()}` },
        body: fd
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.erro || "Falha no envio");
      form.reset();
      setStatus(status, "Solicitação enviada.", "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    }
  });

  carregar();
})();
