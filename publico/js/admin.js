/* =========================================================
   admin.js — painel /admin (KPIs, inbox, páginas, assinantes)
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
  const tbodyPagResumo = document.querySelector("#tabela-pagamentos-resumo tbody");
  const tbodyAcessos = document.querySelector("#tabela-acessos tbody");
  const tbodyPaginas = document.querySelector("#tabela-paginas tbody");
  const tbodyUsuarios = document.querySelector("#tabela-usuarios tbody");
  const formVincular = document.getElementById("form-vincular");
  const vincularStatus = document.getElementById("vincular-status");
  const inboxLista = document.getElementById("inbox-lista");
  const inboxDetalhe = document.getElementById("inbox-detalhe");
  const inboxVazio = document.getElementById("inbox-vazio");
  const badgeNaoLidas = document.getElementById("badge-nao-lidas");
  const btnSyncPaginas = document.getElementById("btn-sync-paginas");

  let tokenMemoria = sessionStorage.getItem("myrep_admin_token") || "";
  let mensagemAtivaId = null;
  let mensagensCache = [];
  let paginasCache = [];
  let filtroPaginas = "";

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
    const url = `/api/admin?${qs.toString()}`;
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

  function parseHash() {
    const raw = (location.hash || "#visao").replace(/^#/, "");
    const [tabPart, filtroPart] = raw.split("/");
    const tab =
      tabPart === "inbox" ||
      tabPart === "assinantes" ||
      tabPart === "visao" ||
      tabPart === "paginas" ||
      tabPart === "usuarios"
        ? tabPart
        : "visao";
    const filtro =
      tab === "paginas" && filtroPart
        ? filtroPart === "inadimplentes"
          ? "inadimplente"
          : filtroPart === "inativas"
            ? "inativa"
            : filtroPart === "sem_email"
              ? "sem_email"
              : filtroPart === "manual"
                ? "manual"
                : filtroPart === "adimplentes"
                  ? "adimplente"
                  : filtroPart
        : "";
    return { tab, filtro };
  }

  function tabAtual() {
    return parseHash().tab;
  }

  function ativarAba(nome) {
    document.querySelectorAll(".admin-tab").forEach((t) => {
      t.classList.toggle("admin-tab--ativa", t.dataset.tab === nome);
    });
    document.querySelectorAll(".admin-aba").forEach((aba) => {
      aba.hidden = aba.dataset.aba !== nome;
    });
  }

  function sincronizarChipsFiltro() {
    document.querySelectorAll("[data-filtro-pagina]").forEach((btn) => {
      btn.classList.toggle("admin-chip--ativa", (btn.dataset.filtroPagina || "") === filtroPaginas);
    });
  }

  function renderAssinaturas(lista) {
    if (!tbodyAss) return;
    if (!lista.length) {
      tbodyAss.innerHTML = `<tr><td colspan="6">Nenhuma assinatura encontrada.</td></tr>`;
      return;
    }
    tbodyAss.innerHTML = lista
      .map((a) => {
        const email = a.cliente?.email || "";
        const plano = a.planoId || "mensal";
        const pg = a.pagina;
        const paginaHtml = pg
          ? `<a href="/${esc(pg.slug)}/" target="_blank" rel="noopener">/${esc(pg.slug)}/</a>
             <div class="assinantes-meta">${esc(pg.situacaoLabel || pg.situacao || "")}${
               pg.controle_manual ? " · Manual" : ""
             }</div>
             <a class="btn-link" href="#paginas">Ver em Páginas</a>`
          : `<span class="assinantes-meta">—</span>`;
        return `<tr>
          <td>
            <strong>${esc(a.cliente?.nome || "—")}</strong><br>
            <span class="assinantes-meta">${esc(email)}</span>
          </td>
          <td>${paginaHtml}</td>
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

  function renderAcessos(lista) {
    if (!tbodyAcessos) return;
    if (!lista.length) {
      tbodyAcessos.innerHTML = `<tr><td colspan="5">Nenhum acesso registrado.</td></tr>`;
      return;
    }
    tbodyAcessos.innerHTML = lista
      .map((a) => {
        const exp = a.expira_em ? new Date(a.expira_em).toLocaleString("pt-BR") : "—";
        return `<tr>
          <td>${esc(a.email)}</td>
          <td>${esc(a.plano)}</td>
          <td>${esc(a.origem)}</td>
          <td>${esc(exp)}</td>
          <td><code>${esc(a.payment_id || "—")}</code></td>
        </tr>`;
      })
      .join("");
  }

  function renderPagamentos(lista, tbody, comAcoes) {
    if (!tbody) return;
    const cols = comAcoes ? 7 : 6;
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="${cols}">Nenhum pagamento recente.</td></tr>`;
      return;
    }
    tbody.innerHTML = lista
      .map((p) => {
        const plano = p.planoId || "mensal";
        const acoes = comAcoes
          ? `<td class="assinantes-acoes">
            <button type="button" class="btn-link" data-liberar-pagamento="${esc(p.id)}" data-liberar-plano="${esc(plano)}" data-customer="${esc(p.customer || "")}">Link</button>
          </td>`
          : "";
        return `<tr>
          <td><code>${esc(p.id)}</code></td>
          <td>${esc(p.planoNome)}</td>
          <td>${esc(brl(p.valor))}</td>
          <td><span class="badge badge--${esc(String(p.status).toLowerCase())}">${esc(p.status)}</span></td>
          <td>${esc(p.billingType || "—")}</td>
          <td>${esc(p.pagamento || p.vencimento || "—")}</td>
          ${acoes}
        </tr>`;
      })
      .join("");
  }

  function renderKpis(resumo) {
    const r = resumo || {};
    const el = (id, v) => {
      const n = document.getElementById(id);
      if (n) n.textContent = v;
    };
    el("kpi-mrr", brl(r.mrr || 0));
    el("kpi-ativas", String(r.assinaturasAtivas ?? 0));
    const por = r.porPlano || {};
    const partes = Object.entries(por).map(([k, v]) => `${k}: ${v}`);
    el("kpi-por-plano", partes.length ? partes.join(" · ") : "Sem quebra por plano");
    el("kpi-mes", brl(r.recebidoMes || 0));
    if (r.variacaoPct == null) {
      el("kpi-variacao", "vs. mês anterior: —");
    } else {
      const sinal = r.variacaoPct > 0 ? "+" : "";
      el("kpi-variacao", `vs. mês anterior: ${sinal}${r.variacaoPct}%`);
    }
    el("kpi-ticket", brl(r.ticketMedio || 0));
    el("kpi-vencidos", String(r.vencidos?.quantidade ?? 0));
    el("kpi-vencidos-meta", brl(r.vencidos?.soma || 0) + " em atraso");
    el("kpi-nao-lidas", String(r.naoLidas ?? 0));

    const pg = r.paginas || {};
    el("kpi-pg-risco", String(pg.inadimplentes ?? 0));
    el("kpi-pg-inativas", String(pg.inativas ?? 0));
    el("kpi-pg-sem-email", String(pg.semEmail ?? 0));
    el("kpi-pg-manual", String(pg.controleManual ?? 0));

    if (badgeNaoLidas) {
      const n = r.naoLidas || 0;
      badgeNaoLidas.hidden = n < 1;
      badgeNaoLidas.textContent = String(n);
    }

    renderPagamentos(r.pagamentosRecentes || [], tbodyPagResumo, false);
  }

  function labelTipo(t) {
    return t === "alteracao" ? "Alteração" : "Briefing";
  }

  function labelStatus(s) {
    const mapa = {
      nova: "Nova",
      em_andamento: "Em andamento",
      publicada: "Publicada",
      arquivada: "Arquivada"
    };
    return mapa[s] || s;
  }

  function renderInboxLista(lista) {
    mensagensCache = lista || [];
    if (!inboxLista) return;
    const itens = mensagensCache;
    if (inboxVazio) inboxVazio.hidden = itens.length > 0;
    inboxLista.querySelectorAll(".admin-inbox__item").forEach((n) => n.remove());

    for (const m of itens) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "admin-inbox__item" + (m.lida ? "" : " admin-inbox__item--nao-lida");
      if (m.id === mensagemAtivaId) btn.classList.add("admin-inbox__item--ativa");
      btn.dataset.id = m.id;
      const quando = m.created_at ? new Date(m.created_at).toLocaleString("pt-BR") : "";
      btn.innerHTML = `
        <span class="admin-inbox__tipo">${esc(labelTipo(m.tipo))}</span>
        <strong class="admin-inbox__assunto">${esc(m.assunto || "(sem assunto)")}</strong>
        <span class="admin-inbox__meta">${esc(m.remetente_email || m.remetente_nome || m.slug || "—")}${
          m.user_id ? " · conta" : ""
        } · ${esc(quando)}</span>
        <span class="badge">${esc(labelStatus(m.status))}</span>`;
      inboxLista.appendChild(btn);
    }
  }

  function ehImagem(mime, nome) {
    if (mime && mime.startsWith("image/")) return true;
    return /\.(jpe?g|png|webp|gif|svg)$/i.test(nome || "");
  }

  function ehPdf(mime, nome) {
    if (mime === "application/pdf") return true;
    return /\.pdf$/i.test(nome || "");
  }

  function formatarValorDado(chave, valor) {
    if (chave === "cidades") {
      if (Array.isArray(valor)) return valor.join(", ");
      if (valor && typeof valor === "object") {
        return Object.entries(valor)
          .filter(([, lista]) => Array.isArray(lista) && lista.length)
          .map(([uf, lista]) => `${uf}: ${lista.join(", ")}`)
          .join("\n");
      }
    }
    if (chave === "estados" && Array.isArray(valor)) return valor.join(", ");
    if (typeof valor === "object") return JSON.stringify(valor, null, 2);
    return String(valor);
  }

  function renderDados(dados) {
    if (!dados || typeof dados !== "object") return "";
    const linhas = Object.entries(dados)
      .filter(([, v]) => {
        if (v == null || v === "") return false;
        if (Array.isArray(v) && !v.length) return false;
        if (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length) return false;
        return true;
      })
      .map(([k, v]) => {
        const valor = formatarValorDado(k, v);
        if (!valor) return "";
        return `<div class="admin-campo">
          <dt>${esc(k)}</dt>
          <dd><pre>${esc(valor)}</pre></dd>
        </div>`;
      })
      .join("");
    return `<dl class="admin-campos">${linhas}</dl>`;
  }

  function renderAnexos(anexos) {
    if (!anexos || !anexos.length) {
      return `<p class="assinantes-meta">Sem anexos.</p>`;
    }
    return `<ul class="admin-anexos">${anexos
      .map((a) => {
        const url = a.url || "#";
        const nome = a.nome || "arquivo";
        let preview = "";
        if (a.url && ehImagem(a.tipo, nome)) {
          preview = `<img class="admin-anexo__preview" src="${esc(url)}" alt="${esc(nome)}" loading="lazy">`;
        } else if (ehPdf(a.tipo, nome)) {
          preview = `<span class="admin-anexo__tipo">PDF</span>`;
        } else if (/\.zip$/i.test(nome) || a.tipo === "application/zip") {
          preview = `<span class="admin-anexo__tipo">ZIP</span>`;
        } else {
          preview = `<span class="admin-anexo__tipo">${esc((a.tipo || "arquivo").split("/").pop())}</span>`;
        }
        return `<li class="admin-anexo">
          ${preview}
          <div class="admin-anexo__info">
            <a href="${esc(url)}" target="_blank" rel="noopener" download="${esc(nome)}">${esc(nome)}</a>
            <span class="assinantes-meta">${esc(a.origem || "")} · ${Math.round((a.tamanho || 0) / 1024)} KB</span>
          </div>
        </li>`;
      })
      .join("")}</ul>`;
  }

  function slugDaMensagem(mensagem) {
    return mensagem?.slug || mensagem?.dados?.slug || "";
  }

  function renderDetalhe(mensagem) {
    if (!inboxDetalhe) return;
    if (!mensagem) {
      inboxDetalhe.innerHTML =
        `<p class="admin-inbox__placeholder">Selecione uma mensagem para ver os detalhes e anexos.</p>`;
      return;
    }

    const quando = mensagem.created_at
      ? new Date(mensagem.created_at).toLocaleString("pt-BR")
      : "—";
    const slug = String(slugDaMensagem(mensagem) || "").trim();
    const atalhoPagina = slug
      ? `<p class="admin-detalhe__atalho">
          <a href="/${esc(slug)}/" target="_blank" rel="noopener">Abrir /${esc(slug)}/</a>
          · <a href="#paginas">Ver status em Páginas</a>
          <span class="assinantes-meta"> · Ao marcar Publicada, o e-mail entra no controle de adimplência se ainda estiver vazio.</span>
        </p>`
      : "";

    inboxDetalhe.innerHTML = `
      <header class="admin-detalhe__topo">
        <div>
          <p class="admin-inbox__tipo">${esc(labelTipo(mensagem.tipo))}</p>
          <h2 class="admin-detalhe__titulo">${esc(mensagem.assunto || "(sem assunto)")}</h2>
          <p class="assinantes-meta">${esc(quando)} · ${esc(mensagem.remetente_email || "—")}</p>
          ${atalhoPagina}
        </div>
        <div class="admin-detalhe__acoes">
          <label class="campo campo--inline">
            <span class="campo__rotulo">Status</span>
            <select id="detalhe-status">
              ${["nova", "em_andamento", "publicada", "arquivada"]
                .map(
                  (s) =>
                    `<option value="${s}" ${mensagem.status === s ? "selected" : ""}>${esc(labelStatus(s))}</option>`
                )
                .join("")}
            </select>
          </label>
          <button type="button" class="btn btn--fantasma-ink" id="btn-toggle-lida">${
            mensagem.lida ? "Marcar não lida" : "Marcar lida"
          }</button>
          <button type="button" class="btn-link btn-link--risco" id="btn-excluir-msg">Excluir</button>
        </div>
      </header>
      <section class="admin-detalhe__bloco">
        <h3 class="assinantes-bloco__titulo">Corpo</h3>
        <pre class="admin-corpo">${esc(mensagem.corpo || "")}</pre>
      </section>
      <section class="admin-detalhe__bloco">
        <h3 class="assinantes-bloco__titulo">Dados do formulário</h3>
        ${renderDados(mensagem.dados)}
      </section>
      <section class="admin-detalhe__bloco">
        <h3 class="assinantes-bloco__titulo">Anexos</h3>
        ${renderAnexos(mensagem.anexos)}
      </section>
      ${
        mensagem.email_erro
          ? `<p class="briefing-status" data-tipo="erro">E-mail: ${esc(mensagem.email_erro)}</p>`
          : mensagem.email_id
            ? `<p class="assinantes-meta">E-mail enviado · id ${esc(mensagem.email_id)}</p>`
            : ""
      }`;

    document.getElementById("detalhe-status")?.addEventListener("change", async (ev) => {
      try {
        await api("mensagem-status", {
          method: "POST",
          body: { id: mensagem.id, status: ev.target.value }
        });
        await carregarInbox();
        const nota =
          ev.target.value === "publicada"
            ? "Status: Publicada. E-mail de cobrança associado à página se estava vazio."
            : "Status atualizado.";
        setStatus(painelStatus, nota, "ok");
      } catch (erro) {
        setStatus(painelStatus, erro.message, "erro");
      }
    });

    document.getElementById("btn-toggle-lida")?.addEventListener("click", async () => {
      try {
        await api("mensagem-lida", {
          method: "POST",
          body: { id: mensagem.id, lida: !mensagem.lida }
        });
        await carregarInbox();
        const data = await api("mensagem", { params: { id: mensagem.id } });
        renderDetalhe(data.mensagem);
        await carregarResumo();
      } catch (erro) {
        setStatus(painelStatus, erro.message, "erro");
      }
    });

    document.getElementById("btn-excluir-msg")?.addEventListener("click", async () => {
      if (!confirm("Excluir esta mensagem e os anexos?")) return;
      try {
        await api("mensagem-excluir", { method: "POST", body: { id: mensagem.id } });
        mensagemAtivaId = null;
        renderDetalhe(null);
        await carregarInbox();
        await carregarResumo();
        setStatus(painelStatus, "Mensagem excluída.", "ok");
      } catch (erro) {
        setStatus(painelStatus, erro.message, "erro");
      }
    });
  }

  async function abrirMensagem(id) {
    mensagemAtivaId = id;
    inboxLista?.querySelectorAll(".admin-inbox__item").forEach((el) => {
      el.classList.toggle("admin-inbox__item--ativa", el.dataset.id === id);
    });
    try {
      const data = await api("mensagem", { params: { id } });
      renderDetalhe(data.mensagem);
      await carregarInbox(false);
      await carregarResumo();
    } catch (erro) {
      setStatus(painelStatus, erro.message, "erro");
    }
  }

  async function carregarInbox(mostrarStatus = true) {
    if (mostrarStatus) setStatus(painelStatus, "Carregando inbox…", "info");
    const params = {
      tipo: document.getElementById("filtro-tipo")?.value || "",
      status: document.getElementById("filtro-status")?.value || "",
      busca: document.getElementById("filtro-busca")?.value || ""
    };
    const data = await api("inbox", { params });
    renderInboxLista(data.mensagens || []);
    if (mostrarStatus) {
      setStatus(painelStatus, `${data.total || 0} mensagem(ns)`, "ok");
    }
  }

  async function carregarResumo() {
    const data = await api("resumo");
    renderKpis(data.resumo);
  }

  function badgeSituacao(p) {
    const codigo = p.situacao || "sem_email";
    const cls =
      codigo === "adimplente"
        ? "admin-sit--ok"
        : codigo === "inadimplente"
          ? "admin-sit--warn"
          : codigo === "inativa"
            ? "admin-sit--off"
            : "admin-sit--muted";
    return `<span class="admin-sit ${cls}">${esc(p.situacaoLabel || codigo)}</span>`;
  }

  function badgeModo(p) {
    if (p.controle_manual) {
      return `<span class="admin-sit admin-sit--manual">Manual</span>`;
    }
    return `<span class="admin-sit admin-sit--auto">Automático</span>`;
  }

  function listaPaginasFiltrada() {
    if (!filtroPaginas) return paginasCache;
    if (filtroPaginas === "manual") {
      return paginasCache.filter((p) => p.controle_manual);
    }
    return paginasCache.filter((p) => (p.situacao || "") === filtroPaginas);
  }

  function renderPaginas(lista) {
    paginasCache = lista || [];
    if (!tbodyPaginas) return;
    const filtrada = listaPaginasFiltrada();
    sincronizarChipsFiltro();
    if (!paginasCache.length) {
      tbodyPaginas.innerHTML = `<tr><td colspan="6">Nenhuma página encontrada.</td></tr>`;
      return;
    }
    if (!filtrada.length) {
      tbodyPaginas.innerHTML = `<tr><td colspan="6">Nenhuma página neste filtro.</td></tr>`;
      return;
    }
    tbodyPaginas.innerHTML = filtrada
      .map((p) => {
        const slug = p.slug || "";
        return `<tr data-slug="${esc(slug)}">
          <td>
            <a href="/${esc(slug)}/" target="_blank" rel="noopener">/${esc(slug)}/</a>
            <div class="assinantes-meta">${esc(p.nome || "")}</div>
          </td>
          <td>${esc(p.dono_email || "—")}</td>
          <td>
            <input type="email" class="admin-pagina-email" data-slug="${esc(slug)}" value="${esc(p.email_cobranca || "")}" placeholder="cliente@email.com">
          </td>
          <td>${badgeSituacao(p)}</td>
          <td>${badgeModo(p)}</td>
          <td class="admin-pagina-acoes">
            <button type="button" class="btn btn--fantasma-ink" data-salvar-email="${esc(slug)}">Salvar e-mail</button>
            ${
              p.ativo === false
                ? `<button type="button" class="btn btn--primario" data-pagina-ativo="${esc(slug)}" data-ativo="1">Reativar</button>`
                : `<button type="button" class="btn btn--fantasma-ink" data-pagina-ativo="${esc(slug)}" data-ativo="0">Desativar</button>`
            }
            ${
              p.controle_manual
                ? `<button type="button" class="btn btn--fantasma-ink" data-pagina-automatico="${esc(slug)}">Voltar ao automático</button>`
                : ""
            }
          </td>
        </tr>`;
      })
      .join("");
  }

  function renderUsuarios(lista) {
    if (!tbodyUsuarios) return;
    if (!lista.length) {
      tbodyUsuarios.innerHTML = `<tr><td colspan="5">Nenhum usuário cadastrado.</td></tr>`;
      return;
    }
    tbodyUsuarios.innerHTML = lista
      .map((u) => {
        const ass = u.assinatura;
        const pag = u.pagina;
        const assHtml = ass
          ? `<span class="badge badge--${esc(ass.status)}">${esc(ass.status)}</span>
             <div class="assinantes-meta">${esc(ass.plano || "")}</div>`
          : "—";
        const pagHtml = pag
          ? `<a href="/${esc(pag.slug)}/" target="_blank" rel="noopener">/${esc(pag.slug)}/</a>
             <div class="assinantes-meta">${esc(pag.situacaoLabel || pag.situacao || "")}</div>`
          : "—";
        const criado = u.criado_em ? new Date(u.criado_em).toLocaleDateString("pt-BR") : "—";
        return `<tr>
          <td>
            <strong>${esc(u.email)}</strong>
            ${u.nome ? `<div class="assinantes-meta">${esc(u.nome)}</div>` : ""}
            ${u.confirmado ? "" : `<div class="assinantes-meta">E-mail não confirmado</div>`}
          </td>
          <td>${assHtml}</td>
          <td>${pagHtml}</td>
          <td>${esc(criado)}</td>
          <td class="assinantes-acoes">
            ${
              !ass || ass.status !== "ativa"
                ? `<button type="button" class="btn-link" data-liberar-assinatura="${esc(u.id)}" data-plano="mensal">Marcar adimplente</button>`
                : ""
            }
            <a class="btn-link" href="#inbox">Inbox</a>
          </td>
        </tr>`;
      })
      .join("");
  }

  async function carregarUsuarios(mostrarStatus = true) {
    if (mostrarStatus) setStatus(painelStatus, "Carregando usuários…", "info");
    const data = await api("usuarios");
    renderUsuarios(data.usuarios || []);
    if (mostrarStatus) {
      setStatus(painelStatus, `${(data.usuarios || []).length} usuário(s)`, "ok");
    }
    return data;
  }

  async function carregarPaginas(mostrarStatus = true) {
    if (mostrarStatus) setStatus(painelStatus, "Carregando páginas…", "info");
    const data = await api("paginas");
    renderPaginas(data.paginas || []);
    if (mostrarStatus) {
      const total = (data.paginas || []).length;
      const filtrada = listaPaginasFiltrada().length;
      setStatus(
        painelStatus,
        filtroPaginas ? `${filtrada} de ${total} página(s)` : `${total} página(s)`,
        "ok"
      );
    }
    return data;
  }

  async function carregarAssinantes() {
    const data = await api("listar");
    renderAssinaturas(data.assinaturas || []);
    renderPagamentos(data.pagamentos || [], tbodyPag, true);
    renderAcessos(data.acessos || []);
    if (data.paginas) paginasCache = data.paginas;
    return data;
  }

  async function carregarTudo() {
    setStatus(painelStatus, "Carregando…", "info");
    const [resumoData, listarData] = await Promise.all([api("resumo"), api("listar")]);
    renderKpis(resumoData.resumo);
    renderAssinaturas(listarData.assinaturas || []);
    renderPagamentos(listarData.pagamentos || [], tbodyPag, true);
    renderAcessos(listarData.acessos || []);
    if (listarData.paginas) renderPaginas(listarData.paginas);
    if (tabAtual() === "inbox") await carregarInbox(false);
    if (tabAtual() === "paginas" && !listarData.paginas) await carregarPaginas(false);
    if (tabAtual() === "usuarios") await carregarUsuarios(false);
    setStatus(
      painelStatus,
      `${(listarData.assinaturas || []).length} assinaturas · ${(listarData.pagamentos || []).length} pagamentos · ${(listarData.paginas || []).length} páginas`,
      "ok"
    );
  }

  async function tentarSessao() {
    try {
      await carregarTudo();
      mostrarPainel(true);
      const { tab, filtro } = parseHash();
      if (filtro) filtroPaginas = filtro;
      ativarAba(tab);
      if (tab === "paginas") renderPaginas(paginasCache);
    } catch {
      tokenMemoria = "";
      sessionStorage.removeItem("myrep_admin_token");
      mostrarPainel(false);
    }
  }

  formLogin?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const senha = new FormData(formLogin).get("senha");
    setStatus(loginStatus, "Entrando…", "info");
    try {
      const data = await api("login", { method: "POST", body: { senha } });
      tokenMemoria = data.token || "";
      if (tokenMemoria) sessionStorage.setItem("myrep_admin_token", tokenMemoria);
      setStatus(loginStatus, "", "");
      mostrarPainel(true);
      const { tab, filtro } = parseHash();
      if (filtro) filtroPaginas = filtro;
      ativarAba(tab);
      await carregarTudo();
    } catch (erro) {
      setStatus(loginStatus, erro.message, "erro");
    }
  });

  btnSair?.addEventListener("click", async () => {
    try {
      await api("logout", { method: "POST", body: {} });
    } catch {
      /* ignore */
    }
    tokenMemoria = "";
    sessionStorage.removeItem("myrep_admin_token");
    mostrarPainel(false);
  });

  btnAtualizar?.addEventListener("click", () => {
    const t = tabAtual();
    const p =
      t === "inbox"
        ? carregarInbox().then(() => carregarResumo())
        : t === "assinantes"
          ? carregarAssinantes()
          : t === "paginas"
            ? carregarPaginas()
            : t === "usuarios"
              ? carregarUsuarios()
              : carregarTudo();
    p.catch((erro) => setStatus(painelStatus, erro.message, "erro"));
  });

  formVincular?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(formVincular);
    setStatus(vincularStatus, "Vinculando…", "info");
    try {
      await api("usuario-vincular", {
        method: "POST",
        body: {
          email: String(fd.get("email") || "").trim(),
          slug: String(fd.get("slug") || "").trim()
        }
      });
      setStatus(vincularStatus, "Página vinculada ao usuário.", "ok");
      formVincular.reset();
      await carregarUsuarios(false);
      await carregarPaginas(false);
    } catch (erro) {
      setStatus(vincularStatus, erro.message, "erro");
    }
  });

  tbodyUsuarios?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-liberar-assinatura]");
    if (!btn) return;
    try {
      await api("usuario-assinatura", {
        method: "POST",
        body: {
          userId: btn.getAttribute("data-liberar-assinatura"),
          plano: btn.getAttribute("data-plano") || "mensal",
          status: "ativa"
        }
      });
      setStatus(painelStatus, "Assinatura marcada como ativa.", "ok");
      await carregarUsuarios(false);
    } catch (erro) {
      setStatus(painelStatus, erro.message, "erro");
    }
  });

  btnSyncPaginas?.addEventListener("click", async () => {
    setStatus(painelStatus, "Sincronizando adimplência com a Asaas…", "info");
    try {
      const data = await api("sincronizar-paginas", { method: "POST", body: {} });
      renderPaginas(data.paginas || []);
      await carregarResumo();
      const falhas = (data.resultados || []).filter((r) => !r.ok).length;
      const manuais = (data.resultados || []).filter((r) => r.controle_manual).length;
      setStatus(
        painelStatus,
        falhas
          ? `Sync concluída com ${falhas} falha(s).`
          : `Adimplência atualizada · ${(data.paginas || []).length} página(s)${
              manuais ? ` · ${manuais} em controle manual (ativo preservado)` : ""
            }.`,
        falhas ? "erro" : "ok"
      );
    } catch (erro) {
      setStatus(painelStatus, erro.message, "erro");
    }
  });

  formLiberar?.addEventListener("submit", async (ev) => {
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

  document.getElementById("filtro-paginas")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-filtro-pagina]");
    if (!btn) return;
    filtroPaginas = btn.dataset.filtroPagina || "";
    const hash =
      filtroPaginas === "inadimplente"
        ? "#paginas/inadimplentes"
        : filtroPaginas === "inativa"
          ? "#paginas/inativas"
          : filtroPaginas === "sem_email"
            ? "#paginas/sem_email"
            : filtroPaginas === "manual"
              ? "#paginas/manual"
              : filtroPaginas === "adimplente"
                ? "#paginas/adimplentes"
                : "#paginas";
    if (location.hash !== hash) {
      location.hash = hash;
    } else {
      renderPaginas(paginasCache);
    }
  });

  document.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;

    const item = t.closest(".admin-inbox__item");
    if (item?.dataset.id) {
      abrirMensagem(item.dataset.id);
      return;
    }

    if (t.dataset.cancelar) {
      if (!confirm("Cancelar esta assinatura na Asaas?")) return;
      try {
        await api("cancelar", { method: "POST", body: { subscriptionId: t.dataset.cancelar } });
        setStatus(painelStatus, "Assinatura cancelada.", "ok");
        await carregarAssinantes();
        await carregarResumo();
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
      return;
    }

    if (t.dataset.salvarEmail) {
      const slug = t.dataset.salvarEmail;
      const input = document.querySelector(`.admin-pagina-email[data-slug="${CSS.escape(slug)}"]`);
      try {
        await api("pagina-email", {
          method: "POST",
          body: { slug, email: input?.value || "" }
        });
        await carregarPaginas(false);
        await carregarResumo();
        setStatus(painelStatus, `E-mail salvo para /${slug}/.`, "ok");
      } catch (erro) {
        setStatus(painelStatus, erro.message, "erro");
      }
      return;
    }

    if (t.dataset.paginaAtivo != null) {
      const slug = t.dataset.paginaAtivo;
      const ativo = t.dataset.ativo === "1";
      const msg = ativo
        ? `Reativar /${slug}/? A página entra em controle manual (automação pausada).`
        : `Desativar /${slug}/? A página responderá 404 e entrará em controle manual.`;
      if (!confirm(msg)) return;
      try {
        await api("pagina-ativo", { method: "POST", body: { slug, ativo } });
        await carregarPaginas(false);
        await carregarResumo();
        setStatus(
          painelStatus,
          ativo
            ? `/${slug}/ reativada (controle manual).`
            : `/${slug}/ desativada (controle manual).`,
          "ok"
        );
      } catch (erro) {
        setStatus(painelStatus, erro.message, "erro");
      }
      return;
    }

    if (t.dataset.paginaAutomatico) {
      const slug = t.dataset.paginaAutomatico;
      if (
        !confirm(
          `Voltar /${slug}/ ao automático? A adimplência será reavaliada na Asaas e a carência volta a valer.`
        )
      ) {
        return;
      }
      try {
        await api("pagina-automatico", { method: "POST", body: { slug } });
        await carregarPaginas(false);
        await carregarResumo();
        setStatus(painelStatus, `/${slug}/ voltou ao automático.`, "ok");
      } catch (erro) {
        setStatus(painelStatus, erro.message, "erro");
      }
    }
  });

  document.getElementById("btn-filtrar-inbox")?.addEventListener("click", () => {
    carregarInbox().catch((erro) => setStatus(painelStatus, erro.message, "erro"));
  });

  document.getElementById("filtro-busca")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      carregarInbox().catch((erro) => setStatus(painelStatus, erro.message, "erro"));
    }
  });

  window.addEventListener("hashchange", () => {
    const { tab, filtro } = parseHash();
    ativarAba(tab);
    if (tab === "inbox") {
      carregarInbox().catch((erro) => setStatus(painelStatus, erro.message, "erro"));
    } else if (tab === "paginas") {
      filtroPaginas = filtro || "";
      if (paginasCache.length) {
        renderPaginas(paginasCache);
      } else {
        carregarPaginas().catch((erro) => setStatus(painelStatus, erro.message, "erro"));
      }
    } else if (tab === "usuarios") {
      carregarUsuarios().catch((erro) => setStatus(painelStatus, erro.message, "erro"));
    } else if (tab === "assinantes") {
      carregarAssinantes().catch((erro) => setStatus(painelStatus, erro.message, "erro"));
    }
  });

  if (!location.hash) location.hash = "#visao";
  tentarSessao();
})();
