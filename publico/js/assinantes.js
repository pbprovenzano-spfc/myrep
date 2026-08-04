/* =========================================================
   assinantes.js — painel admin (Asaas)
   ========================================================= */

(function () {
  const telaLogin = document.getElementById("tela-login");
  const telaPainel = document.getElementById("tela-painel");
  const formLogin = document.getElementById("form-login");
  const formLiberar = document.getElementById("form-liberar");
  const loginStatus = document.getElementById("login-status");
  const painelStatus = document.getElementById("painel-status");
  const liberarResultado = document.getElementById("liberar-resultado");
  const btnSair = document.getElementById("btn-sair");
  const btnAtualizar = document.getElementById("btn-atualizar");
  const tbodyAss = document.querySelector("#tabela-assinaturas tbody");
  const tbodyPag = document.querySelector("#tabela-pagamentos tbody");

  let tokenMemoria = sessionStorage.getItem("myrep_admin_token") || "";

  function setStatus(el, msg, tipo) {
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.tipo = tipo || "";
  }

  function headersAuth(json) {
    const h = {};
    if (json) h["Content-Type"] = "application/json";
    if (tokenMemoria) h.Authorization = `Bearer ${tokenMemoria}`;
    return h;
  }

  async function api(acao, { method = "GET", body, params } = {}) {
    const qs = new URLSearchParams({ acao, ...(params || {}) });
    const url = `/api/assinantes?${qs.toString()}`;
    const resp = await fetch(url, {
      method,
      headers: headersAuth(!!body),
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data.erro || `Erro ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  function mostrarPainel(ativo) {
    telaLogin.hidden = ativo;
    telaPainel.hidden = !ativo;
    btnSair.hidden = !ativo;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function brl(v) {
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function renderAssinaturas(lista) {
    if (!lista.length) {
      tbodyAss.innerHTML = `<tr><td colspan="5">Nenhuma assinatura encontrada.</td></tr>`;
      return;
    }
    tbodyAss.innerHTML = lista
      .map((a) => {
        const email = a.cliente?.email || "";
        const plano = a.planoId || "mensal";
        return `<tr>
          <td>
            <strong>${esc(a.cliente?.nome || "—")}</strong><br>
            <span class="assinantes-meta">${esc(email)}</span>
          </td>
          <td>${esc(a.planoNome)}<br><span class="assinantes-meta">${esc(brl(a.valor))}</span></td>
          <td><span class="badge badge--${esc(String(a.status).toLowerCase())}">${esc(a.status)}</span></td>
          <td>${esc(a.proximoVencimento || "—")}</td>
          <td class="assinantes-acoes">
            <button type="button" class="btn-link" data-liberar-email="${esc(email)}" data-liberar-plano="${esc(plano)}">Link briefing</button>
            ${
              a.status === "ACTIVE"
                ? `<button type="button" class="btn-link btn-link--risco" data-cancelar="${esc(a.id)}">Cancelar</button>`
                : ""
            }
          </td>
        </tr>`;
      })
      .join("");
  }

  function renderPagamentos(lista) {
    if (!lista.length) {
      tbodyPag.innerHTML = `<tr><td colspan="7">Nenhum pagamento recente.</td></tr>`;
      return;
    }
    tbodyPag.innerHTML = lista
      .map((p) => {
        const plano = p.planoId || "mensal";
        return `<tr>
          <td><code>${esc(p.id)}</code></td>
          <td>${esc(p.planoNome)}</td>
          <td>${esc(brl(p.valor))}</td>
          <td><span class="badge badge--${esc(String(p.status).toLowerCase())}">${esc(p.status)}</span></td>
          <td>${esc(p.billingType || "—")}</td>
          <td>${esc(p.pagamento || p.vencimento || "—")}</td>
          <td class="assinantes-acoes">
            <button type="button" class="btn-link" data-liberar-pagamento="${esc(p.id)}" data-liberar-plano="${esc(plano)}" data-customer="${esc(p.customer || "")}">Link</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  async function carregar() {
    setStatus(painelStatus, "Carregando…", "info");
    const data = await api("listar");
    renderAssinaturas(data.assinaturas || []);
    renderPagamentos(data.pagamentos || []);
    setStatus(painelStatus, `${(data.assinaturas || []).length} assinaturas · ${(data.pagamentos || []).length} pagamentos`, "ok");
  }

  async function tentarSessao() {
    try {
      await carregar();
      mostrarPainel(true);
    } catch (erro) {
      tokenMemoria = "";
      sessionStorage.removeItem("myrep_admin_token");
      mostrarPainel(false);
    }
  }

  formLogin.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const senha = new FormData(formLogin).get("senha");
    setStatus(loginStatus, "Entrando…", "info");
    try {
      const data = await api("login", { method: "POST", body: { senha } });
      tokenMemoria = data.token || "";
      if (tokenMemoria) sessionStorage.setItem("myrep_admin_token", tokenMemoria);
      setStatus(loginStatus, "", "");
      mostrarPainel(true);
      await carregar();
    } catch (erro) {
      setStatus(loginStatus, erro.message, "erro");
    }
  });

  btnSair.addEventListener("click", async () => {
    try {
      await api("logout", { method: "POST", body: {} });
    } catch {
      /* ignore */
    }
    tokenMemoria = "";
    sessionStorage.removeItem("myrep_admin_token");
    mostrarPainel(false);
  });

  btnAtualizar.addEventListener("click", () => {
    carregar().catch((erro) => setStatus(painelStatus, erro.message, "erro"));
  });

  formLiberar.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(formLiberar);
    try {
      const data = await api("liberar", {
        method: "POST",
        body: { email: fd.get("email"), plano: fd.get("plano") }
      });
      const abs = location.origin + data.briefingUrl;
      liberarResultado.hidden = false;
      liberarResultado.innerHTML = `Link gerado: <a href="${esc(data.briefingUrl)}">${esc(abs)}</a>`;
    } catch (erro) {
      liberarResultado.hidden = false;
      liberarResultado.textContent = erro.message;
    }
  });

  async function liberarRapido(email, plano, paymentId) {
    if (!email) {
      const informado = prompt("E-mail do cliente para o link do briefing:");
      if (!informado) return;
      email = informado;
    }
    const data = await api("liberar", {
      method: "POST",
      body: { email, plano, paymentId }
    });
    const abs = location.origin + data.briefingUrl;
    await navigator.clipboard?.writeText(abs);
    setStatus(painelStatus, `Link copiado: ${abs}`, "ok");
  }

  document.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;

    if (t.dataset.cancelar) {
      if (!confirm("Cancelar esta assinatura na Asaas?")) return;
      try {
        await api("cancelar", { method: "POST", body: { subscriptionId: t.dataset.cancelar } });
        setStatus(painelStatus, "Assinatura cancelada.", "ok");
        await carregar();
      } catch (erro) {
        setStatus(painelStatus, erro.message, "erro");
      }
      return;
    }

    if (t.dataset.liberarEmail) {
      try {
        await liberarRapido(t.dataset.liberarEmail, t.dataset.liberarPlano);
      } catch (erro) {
        setStatus(painelStatus, erro.message, "erro");
      }
      return;
    }

    if (t.dataset.liberarPagamento) {
      try {
        let email = "";
        if (t.dataset.customer) {
          const info = await api("cliente", { params: { id: t.dataset.customer } });
          email = info.cliente?.email || "";
        }
        await liberarRapido(email, t.dataset.liberarPlano, t.dataset.liberarPagamento);
      } catch (erro) {
        setStatus(painelStatus, erro.message, "erro");
      }
    }
  });

  tentarSessao();
})();
