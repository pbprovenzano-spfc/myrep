/* =========================================================
   assinatura.js — gerenciar plano, cartão, cobrança e pagamentos
   ========================================================= */

(function () {
  const carregando = document.getElementById("assinatura-carregando");
  const conteudo = document.getElementById("assinatura-conteudo");
  const btnSair = document.getElementById("btn-sair");

  let dados = null;

  const STATUS_PAGAMENTO = {
    PENDING: "Aguardando pagamento",
    RECEIVED: "Pago",
    CONFIRMED: "Pago",
    RECEIVED_IN_CASH: "Pago",
    OVERDUE: "Em atraso",
    REFUNDED: "Devolvido",
    REFUND_REQUESTED: "Devolução pedida",
    CHARGEBACK_REQUESTED: "Contestado",
    CHARGEBACK_DISPUTE: "Em disputa",
    AWAITING_CHARGEBACK_REVERSAL: "Em disputa",
    AWAITING_RISK_ANALYSIS: "Em análise",
    DUNNING_REQUESTED: "Em cobrança",
    DUNNING_RECEIVED: "Pago",
    CANCELED: "Cancelado",
    DELETED: "Removido"
  };

  const TIPO_PAGAMENTO = {
    CREDIT_CARD: "Cartão",
    PIX: "PIX",
    BOLETO: "Boleto",
    UNDEFINED: ""
  };

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

  function digitos(valor) {
    return String(valor || "").replace(/\D/g, "");
  }

  function formatarData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return "";
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function formatarReais(valor) {
    return (Number(valor) || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function initAjudas() {
    document.addEventListener("click", (ev) => {
      const botao = ev.target.closest("[data-ajuda-toggle]");
      if (!botao) return;
      ev.preventDefault();
      const aberto = botao.getAttribute("aria-expanded") === "true";
      botao.setAttribute("aria-expanded", aberto ? "false" : "true");
      const painel = document.getElementById(botao.getAttribute("aria-controls") || "");
      if (painel) painel.hidden = aberto;
    });
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

  async function authHeaders(jsonBody) {
    const h = { Authorization: `Bearer ${await window.MyRepAuth.accessToken()}` };
    if (jsonBody) h["Content-Type"] = "application/json";
    return h;
  }

  async function api(caminho, opcoes = {}) {
    const resp = await fetch(caminho, {
      ...opcoes,
      headers: await authHeaders(!!opcoes.body),
      credentials: "same-origin"
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const erro = new Error(data.erro || "Não foi possível concluir.");
      erro.status = resp.status;
      throw erro;
    }
    return data;
  }

  function irParaLogin(comErro) {
    const volta = encodeURIComponent(location.pathname + location.search);
    location.replace(`/entrar/?${comErro ? "erro=sessao&" : ""}next=${volta}`);
  }

  /* ---------------- render ---------------- */

  const LABEL_STATUS = {
    ativa: "Adimplente",
    inadimplente: "Inadimplente",
    cancelada: "Cancelada",
    pendente: "Pagamento pendente"
  };

  function renderBadge(assinatura) {
    const badge = document.getElementById("assinatura-badge");
    if (!assinatura) {
      badge.textContent = "Sem assinatura";
      badge.dataset.status = "pendente";
      return;
    }
    if (assinatura.plano === "vitalicio" && assinatura.status === "ativa") {
      badge.textContent = "Vitalício";
      badge.dataset.status = "ativa";
      return;
    }
    if (assinatura.cancelamento_agendado && assinatura.status === "ativa") {
      badge.textContent = "Cancelamento agendado";
      badge.dataset.status = "pendente";
      return;
    }
    badge.textContent = LABEL_STATUS[assinatura.status] || assinatura.status;
    badge.dataset.status = assinatura.status;
  }

  function renderPlano(assinatura) {
    const resumo = document.getElementById("plano-resumo");
    const prazo = document.getElementById("plano-prazo");
    const aviso = document.getElementById("plano-aviso");
    setStatus(aviso, "", "");

    if (!assinatura) {
      resumo.textContent = "Você ainda não tem assinatura.";
      prazo.innerHTML = '<a href="/painel/">Escolher um plano no painel</a>';
      return;
    }

    resumo.textContent = `Plano ${assinatura.planoNome}${
      assinatura.planoLabel ? ` · ${assinatura.planoLabel}` : ""
    }`;

    const data = formatarData(assinatura.proxima_cobranca);
    if (assinatura.plano === "vitalicio") {
      prazo.textContent = "Acesso permanente, sem cobranças.";
    } else if (assinatura.cancelamento_agendado && data) {
      prazo.textContent = `Sua página fica no ar até ${data}.`;
    } else if (assinatura.status === "ativa" && assinatura.recorrente && data) {
      prazo.textContent = `Próxima cobrança em ${data}.`;
    } else if (assinatura.status === "ativa" && data) {
      prazo.textContent = `Plano válido até ${data}.`;
    } else {
      prazo.textContent = "";
    }

    if (assinatura.cancelamento_agendado) {
      setStatus(aviso, "Cancelamento confirmado. Não haverá novas cobranças.", "info");
    } else if (assinatura.status === "inadimplente") {
      setStatus(
        aviso,
        "Pagamento em atraso. Regularize para manter a página no ar (carência de 3 dias).",
        "erro"
      );
    } else if (assinatura.status === "pendente") {
      setStatus(aviso, "Estamos aguardando a confirmação do pagamento na Asaas.", "info");
    } else if (assinatura.status === "cancelada") {
      setStatus(aviso, "Escolha um plano para colocar a página no ar de novo.", "info");
    }
  }

  function renderCartao(assinatura, cartao) {
    const secao = document.getElementById("secao-cartao");
    const mostrar = !!assinatura?.recorrente && assinatura.status !== "cancelada";
    secao.hidden = !mostrar;
    if (!mostrar) return;

    const resumo = document.getElementById("cartao-resumo");
    if (cartao?.ultimos) {
      resumo.textContent = `${cartao.bandeira || "Cartão"} •••• ${cartao.ultimos}`;
    } else if (assinatura.temAsaas) {
      resumo.textContent = "Cartão cadastrado na Asaas.";
    } else {
      resumo.textContent = "Nenhum cartão salvo para esta assinatura.";
    }

    document.getElementById("btn-abrir-cartao").hidden = !assinatura.temAsaas;
  }

  function renderTroca(assinatura) {
    const secao = document.getElementById("secao-troca");
    const podeTrocar =
      !!assinatura &&
      assinatura.status === "ativa" &&
      assinatura.plano !== "vitalicio" &&
      !assinatura.cancelamento_agendado;
    secao.hidden = !podeTrocar;
    if (!podeTrocar) return;

    document.querySelectorAll("#planos-troca [data-troca]").forEach((btn) => {
      if (!btn.dataset.rotulo) btn.dataset.rotulo = btn.textContent;
      const atual = btn.getAttribute("data-troca") === assinatura.plano;
      btn.disabled = atual;
      btn.textContent = atual ? "Seu plano atual" : btn.dataset.rotulo;
    });
  }

  function renderCancelar(assinatura) {
    const secao = document.getElementById("secao-cancelar");
    const podeCancelar =
      !!assinatura &&
      ["ativa", "inadimplente"].includes(assinatura.status) &&
      assinatura.plano !== "vitalicio" &&
      !assinatura.cancelamento_agendado;
    secao.hidden = !podeCancelar;
    document.getElementById("cancelar-confirma").hidden = true;
    if (!podeCancelar) return;

    const data = formatarData(assinatura.proxima_cobranca);
    document.getElementById("cancelar-texto").textContent =
      assinatura.status === "ativa" && data
        ? `Você para de ser cobrado agora e mantém a página no ar até ${data}.`
        : "Você para de ser cobrado e a página sai do ar.";
    document.getElementById("cancelar-confirma-texto").textContent =
      assinatura.status === "ativa" && data
        ? `Confirma o cancelamento? A página fica no ar até ${data}.`
        : "Confirma o cancelamento? A página sai do ar.";
  }

  function renderHistorico(historico) {
    const lista = document.getElementById("historico-lista");
    const vazio = document.getElementById("historico-vazio");
    const itens = Array.isArray(historico) ? historico : [];
    lista.hidden = !itens.length;
    vazio.hidden = !!itens.length;
    if (!itens.length) return;

    lista.innerHTML = itens
      .map((p) => {
        const quando = formatarData(p.pagoEm || p.vencimento);
        const tipo = TIPO_PAGAMENTO[p.tipo] || "";
        const parcela = p.parcela ? ` · parcela ${p.parcela}` : "";
        const links = [];
        if (p.reciboUrl) {
          links.push(
            `<a href="${esc(p.reciboUrl)}" target="_blank" rel="noopener">Recibo</a>`
          );
        }
        if (p.faturaUrl) {
          links.push(
            `<a href="${esc(p.faturaUrl)}" target="_blank" rel="noopener">Fatura</a>`
          );
        }
        return `<li class="painel-pagamento">
          <span class="painel-pagamento__data">${esc(quando)}</span>
          <span class="painel-pagamento__valor">${esc(formatarReais(p.valor))}</span>
          <span class="painel-pagamento__status">${esc(
            STATUS_PAGAMENTO[p.status] || p.status
          )}${esc(tipo ? ` · ${tipo}` : "")}${esc(parcela)}</span>
          <span class="painel-pagamento__links">${links.join(" · ")}</span>
        </li>`;
      })
      .join("");
  }

  function preencherCobranca(c) {
    if (!c) return;
    const set = (id, valor) => {
      const el = document.getElementById(id);
      if (el) el.value = valor || "";
    };
    set("cobranca-nome", c.nome);
    set("cobranca-documento", c.cpfCnpj);
    set("cobranca-celular", window.MyRepMascaras?.formatarCelular(c.celular) ?? c.celular);
    set("cobranca-cep", c.cep);
    set("cobranca-endereco", c.endereco);
    set("cobranca-numero", c.numero);
    set("cobranca-complemento", c.complemento);
    set("cobranca-bairro", c.bairro);
    set("cobranca-cidade", c.cidade);
    set("cobranca-uf", c.uf);
  }

  function lerCobrancaForm() {
    const valor = (id) => document.getElementById(id)?.value || "";
    return {
      nome: valor("cobranca-nome"),
      documento: valor("cobranca-documento"),
      celular: valor("cobranca-celular"),
      cep: valor("cobranca-cep"),
      endereco: valor("cobranca-endereco"),
      numero: valor("cobranca-numero"),
      complemento: valor("cobranca-complemento"),
      bairro: valor("cobranca-bairro"),
      cidade: valor("cobranca-cidade"),
      uf: valor("cobranca-uf")
    };
  }

  function render(data) {
    dados = data;
    document.getElementById("assinatura-email").textContent = data.email || "";
    renderBadge(data.assinatura);
    renderPlano(data.assinatura);
    renderCartao(data.assinatura, data.cartao);
    renderTroca(data.assinatura);
    renderCancelar(data.assinatura);
    renderHistorico(data.historico);
    preencherCobranca(data.cobranca);
  }

  /* ---------------- cartão ---------------- */

  function formatarNumeroCartao(valor) {
    return digitos(valor)
      .slice(0, 19)
      .replace(/(\d{4})(?=\d)/g, "$1 ")
      .trim();
  }

  function formatarValidade(valor) {
    const d = digitos(valor).slice(0, 4);
    if (d.length <= 2) return d;
    return `${d.slice(0, 2)}/${d.slice(2)}`;
  }

  function ligarMascaraCartao() {
    const numero = document.getElementById("cartao-numero");
    numero?.addEventListener("input", () => {
      const noFim = numero.selectionStart === numero.value.length;
      numero.value = formatarNumeroCartao(numero.value);
      if (noFim) numero.setSelectionRange(numero.value.length, numero.value.length);
    });
    const validade = document.getElementById("cartao-validade");
    validade?.addEventListener("input", () => {
      const noFim = validade.selectionStart === validade.value.length;
      validade.value = formatarValidade(validade.value);
      if (noFim) validade.setSelectionRange(validade.value.length, validade.value.length);
    });
    const cvv = document.getElementById("cartao-cvv");
    cvv?.addEventListener("input", () => {
      cvv.value = digitos(cvv.value).slice(0, 4);
    });
  }

  function limparFormCartao() {
    ["cartao-titular", "cartao-numero", "cartao-validade", "cartao-cvv"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  }

  function abrirFormCartao(aberto) {
    document.getElementById("form-cartao").hidden = !aberto;
    document.getElementById("btn-abrir-cartao").hidden = aberto;
    if (!aberto) limparFormCartao();
    setStatus(document.getElementById("cartao-status"), "", "");
    if (aberto) document.getElementById("cartao-titular")?.focus();
  }

  async function salvarCartao(ev) {
    ev.preventDefault();
    const status = document.getElementById("cartao-status");
    const btn = document.getElementById("btn-salvar-cartao");
    const validade = digitos(document.getElementById("cartao-validade")?.value);
    if (validade.length !== 4) {
      setStatus(status, "Informe a validade no formato MM/AA.", "erro");
      return;
    }

    const corpo = {
      titular: document.getElementById("cartao-titular")?.value || "",
      numero: digitos(document.getElementById("cartao-numero")?.value),
      mes: validade.slice(0, 2),
      ano: validade.slice(2),
      cvv: digitos(document.getElementById("cartao-cvv")?.value)
    };

    btn.disabled = true;
    setStatus(status, "Enviando para a Asaas…", "info");
    try {
      const data = await api("/api/painel/cartao", {
        method: "PUT",
        body: JSON.stringify(corpo)
      });
      limparFormCartao();
      dados.cartao = data.cartao;
      renderCartao(dados.assinatura, data.cartao);
      abrirFormCartao(false);
      setStatus(document.getElementById("cartao-status"), data.aviso, "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------- ações ---------------- */

  async function salvarCobranca(ev) {
    ev.preventDefault();
    const status = document.getElementById("cobranca-status");
    const btn = document.getElementById("btn-salvar-cobranca");
    btn.disabled = true;
    setStatus(status, "Salvando…", "info");
    try {
      const data = await api("/api/painel/cobranca", {
        method: "PUT",
        body: JSON.stringify({ cobranca: lerCobrancaForm() })
      });
      dados.cobranca = data.cobranca;
      preencherCobranca(data.cobranca);
      setStatus(status, data.aviso, "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    } finally {
      btn.disabled = false;
    }
  }

  async function trocarPlano(plano) {
    const status = document.getElementById("troca-status");
    const botoes = [...document.querySelectorAll("#planos-troca [data-troca]")];
    botoes.forEach((b) => {
      b.disabled = true;
    });
    setStatus(status, "Abrindo o pagamento na Asaas…", "info");
    try {
      const data = await api("/api/painel/checkout", {
        method: "POST",
        body: JSON.stringify({ plano, troca: true })
      });
      location.href = data.linkPagamento;
    } catch (erro) {
      renderTroca(dados.assinatura);
      setStatus(status, erro.message, "erro");
    }
  }

  async function cancelar() {
    const status = document.getElementById("cancelar-status");
    const btn = document.getElementById("btn-cancelar-confirmar");
    btn.disabled = true;
    setStatus(status, "Cancelando na Asaas…", "info");
    try {
      const data = await api("/api/painel/assinatura", { method: "DELETE" });
      dados.assinatura = data.assinatura;
      renderBadge(data.assinatura);
      renderPlano(data.assinatura);
      renderCartao(data.assinatura, dados.cartao);
      renderTroca(data.assinatura);
      renderCancelar(data.assinatura);
      setStatus(document.getElementById("plano-aviso"), data.aviso, "ok");
    } catch (erro) {
      setStatus(status, erro.message, "erro");
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------- carga ---------------- */

  async function carregar() {
    try {
      await esperarAuth();
      const sessao = await window.MyRepAuth.sessaoAtual();
      if (!sessao) {
        irParaLogin(false);
        return;
      }
      render(await api("/api/painel/assinatura"));
      carregando.hidden = true;
      conteudo.hidden = false;
      btnSair.hidden = false;
    } catch (erro) {
      if (erro.status === 401) {
        try {
          await window.MyRepAuth.getClient()?.auth.signOut();
        } catch {
          /* ignore */
        }
        irParaLogin(true);
        return;
      }
      carregando.textContent = erro.message || "Não foi possível carregar.";
      carregando.dataset.tipo = "erro";
    }
  }

  window.MyRepMascaras?.ligarCelular(document.getElementById("cobranca-celular"));
  window.MyRepCep?.ligarCep(document.getElementById("cobranca-cep"), {
    endereco: document.getElementById("cobranca-endereco"),
    bairro: document.getElementById("cobranca-bairro"),
    cidade: document.getElementById("cobranca-cidade"),
    uf: document.getElementById("cobranca-uf")
  });

  document.getElementById("form-cobranca")?.addEventListener("submit", salvarCobranca);
  document.getElementById("form-cartao")?.addEventListener("submit", salvarCartao);
  document.getElementById("btn-abrir-cartao")?.addEventListener("click", () => abrirFormCartao(true));
  document.getElementById("btn-cancelar-cartao")?.addEventListener("click", () => abrirFormCartao(false));

  document.getElementById("planos-troca")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-troca]");
    if (!btn || btn.disabled) return;
    trocarPlano(btn.getAttribute("data-troca"));
  });

  document.getElementById("btn-cancelar")?.addEventListener("click", () => {
    document.getElementById("cancelar-confirma").hidden = false;
    document.getElementById("btn-cancelar-confirmar")?.focus();
  });
  document.getElementById("btn-cancelar-voltar")?.addEventListener("click", () => {
    document.getElementById("cancelar-confirma").hidden = true;
    setStatus(document.getElementById("cancelar-status"), "", "");
  });
  document.getElementById("btn-cancelar-confirmar")?.addEventListener("click", cancelar);

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
  ligarMascaraCartao();
  carregar();
})();
