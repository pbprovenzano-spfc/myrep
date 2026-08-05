/* =========================================================
   /api/admin — painel (login, KPIs, assinantes, inbox)
   ========================================================= */

const {
  asaasFetch,
  emitirToken,
  lerJsonBody,
  json,
  PLANOS,
  STATUS_PAGO,
  adminSenhaOk,
  emitirSessaoAdmin,
  lerSessaoAdmin,
  cookieValor,
  valoresIguais,
  buscarClientePorEmail,
  listarPagamentosCliente
} = require("./_lib/pagamento");
const { listarAcessos, registrarAcesso } = require("./_lib/acessos");
const {
  listarMensagens,
  obterMensagem,
  marcarLida,
  mudarStatus,
  excluirMensagem,
  contarNaoLidas
} = require("./_lib/inbox");
const {
  listarPaginas,
  salvarMeta,
  associarEmailSeVazio,
  normalizarEmail,
  normalizarSlug,
  resumirPaginas,
  situacaoDe
} = require("./_lib/paginas");

function exigirAdmin(req) {
  const token =
    cookieValor(req, "myrep_admin") ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    const erro = new Error("Faça login no painel.");
    erro.status = 401;
    throw erro;
  }
  return lerSessaoAdmin(token);
}

function planoPorValor(valor) {
  for (const p of Object.values(PLANOS)) {
    if (valoresIguais(valor, p.valor)) return p;
  }
  return null;
}

function mrrDeAssinatura(sub) {
  if (!sub || String(sub.status).toUpperCase() !== "ACTIVE") return 0;
  const plano = planoPorValor(sub.value);
  const valor = Number(sub.value) || 0;
  if (plano?.id === "anual_avista") return valor / 12;
  if (String(sub.cycle || "").toUpperCase() === "YEARLY") return valor / 12;
  return valor;
}

function inicioMes(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoData(d) {
  return d.toISOString().slice(0, 10);
}

async function listarAssinaturas() {
  const data = await asaasFetch("/subscriptions?limit=50&offset=0");
  const lista = data?.data || [];

  const enriquecidas = [];
  for (const sub of lista) {
    let cliente = null;
    try {
      cliente = await asaasFetch(`/customers/${encodeURIComponent(sub.customer)}`);
    } catch {
      cliente = null;
    }
    const plano = planoPorValor(sub.value);
    enriquecidas.push({
      id: sub.id,
      status: sub.status,
      valor: sub.value,
      ciclo: sub.cycle,
      proximoVencimento: sub.nextDueDate,
      billingType: sub.billingType,
      description: sub.description,
      planoId: plano?.id || null,
      planoNome: plano?.nome || "Outro",
      cliente: cliente
        ? { id: cliente.id, nome: cliente.name, email: cliente.email, cpfCnpj: cliente.cpfCnpj }
        : { id: sub.customer, nome: "—", email: "—", cpfCnpj: null }
    });
  }
  return enriquecidas;
}

async function listarPagamentosRecentes() {
  const data = await asaasFetch("/payments?limit=40&offset=0");
  const lista = data?.data || [];
  return lista.map((p) => {
    const plano = planoPorValor(p.value);
    return {
      id: p.id,
      status: p.status,
      valor: p.value,
      vencimento: p.dueDate,
      pagamento: p.paymentDate || p.clientPaymentDate || null,
      billingType: p.billingType,
      customer: p.customer,
      subscription: p.subscription || null,
      planoId: plano?.id || null,
      planoNome: plano?.nome || "Outro"
    };
  });
}

async function listarPagamentosDesde(dataIso) {
  const data = await asaasFetch(
    `/payments?limit=100&offset=0&paymentDate[ge]=${encodeURIComponent(dataIso)}`
  );
  return data?.data || [];
}

async function avaliarAdimplenciaEmail(email) {
  const e = normalizarEmail(email);
  if (!e || !process.env.ASAAS_API_KEY) {
    return { estado: "desconhecido", motivo: "Sem Asaas ou e-mail" };
  }
  const cliente = await buscarClientePorEmail(e);
  if (!cliente) {
    return { estado: "inadimplente", motivo: "Cliente Asaas não encontrado" };
  }

  let subs = [];
  try {
    const data = await asaasFetch(
      `/subscriptions?customer=${encodeURIComponent(cliente.id)}&limit=20`
    );
    subs = data?.data || [];
  } catch {
    subs = [];
  }

  const ativa = subs.some((s) => String(s.status).toUpperCase() === "ACTIVE");
  if (ativa) return { estado: "adimplente", motivo: "Assinatura ACTIVE" };

  const pagamentos = await listarPagamentosCliente(cliente.id, { limit: 40 });
  const temOverdue = pagamentos.some((p) => String(p.status).toUpperCase() === "OVERDUE");
  const temPago = pagamentos.some((p) => STATUS_PAGO.has(String(p.status).toUpperCase()));

  if (temOverdue) return { estado: "inadimplente", motivo: "Pagamento OVERDUE" };
  if (temPago && !subs.length) return { estado: "adimplente", motivo: "Pagamento confirmado" };
  if (temPago && subs.length) {
    return { estado: "inadimplente", motivo: "Assinatura sem status ACTIVE" };
  }
  return { estado: "inadimplente", motivo: "Sem assinatura ativa nem pagamento" };
}

async function aplicarAvaliacaoNaPagina(p, av, { agora = new Date().toISOString() } = {}) {
  const manual = p.controle_manual === true;
  if (av.estado === "adimplente") {
    const patch = { inadimplente_desde: null };
    if (!manual) patch.ativo = true;
    const atualizado = await salvarMeta(p.slug, patch);
    const sit = situacaoDe(atualizado);
    return {
      slug: p.slug,
      ok: true,
      situacao: sit.codigo,
      nota: manual ? `${av.motivo} · controle manual (ativo preservado)` : av.motivo,
      ativo: atualizado.ativo,
      controle_manual: atualizado.controle_manual === true
    };
  }
  if (av.estado === "inadimplente") {
    const patch = {};
    if (!p.inadimplente_desde) patch.inadimplente_desde = agora;
    const atualizado = await salvarMeta(p.slug, patch);
    const sit = situacaoDe(atualizado);
    return {
      slug: p.slug,
      ok: true,
      situacao: sit.codigo,
      nota: manual ? `${av.motivo} · controle manual (ativo preservado)` : av.motivo,
      ativo: atualizado.ativo,
      inadimplente_desde: atualizado.inadimplente_desde,
      controle_manual: atualizado.controle_manual === true
    };
  }
  return {
    slug: p.slug,
    ok: true,
    situacao: p.situacao,
    nota: av.motivo,
    controle_manual: manual
  };
}

async function sincronizarPaginaSlug(slug) {
  const s = normalizarSlug(slug);
  const paginas = await listarPaginas();
  const p = paginas.find((x) => x.slug === s);
  if (!p) {
    throw Object.assign(new Error("Página não encontrada."), { status: 404 });
  }
  if (!p.email_cobranca) {
    return {
      pagina: p,
      resultado: { slug: p.slug, ok: true, situacao: p.situacao, nota: "Sem e-mail" }
    };
  }
  const av = await avaliarAdimplenciaEmail(p.email_cobranca);
  const resultado = await aplicarAvaliacaoNaPagina(p, av);
  const lista = await listarPaginas();
  return {
    pagina: lista.find((x) => x.slug === s) || p,
    resultado
  };
}

async function sincronizarPaginas() {
  const paginas = await listarPaginas();
  const agora = new Date().toISOString();
  const resultados = [];

  for (const p of paginas) {
    if (!p.email_cobranca) {
      resultados.push({
        slug: p.slug,
        ok: true,
        situacao: p.situacao,
        nota: "Sem e-mail",
        controle_manual: p.controle_manual === true
      });
      continue;
    }
    try {
      const av = await avaliarAdimplenciaEmail(p.email_cobranca);
      resultados.push(await aplicarAvaliacaoNaPagina(p, av, { agora }));
    } catch (erro) {
      resultados.push({
        slug: p.slug,
        ok: false,
        erro: erro.message || "Falha na sync"
      });
    }
  }

  return { paginas: await listarPaginas(), resultados };
}

async function calcularResumo() {
  let paginas = [];
  try {
    paginas = await listarPaginas();
  } catch (erro) {
    console.error("resumo páginas:", erro.message || erro);
    paginas = [];
  }
  const paginasResumo = resumirPaginas(paginas);

  const vazio = {
    mrr: 0,
    assinaturasAtivas: 0,
    porPlano: {},
    recebidoMes: 0,
    recebidoMesAnterior: 0,
    variacaoPct: null,
    ticketMedio: 0,
    vencidos: { quantidade: 0, soma: 0 },
    naoLidas: 0,
    pagamentosRecentes: [],
    paginas: paginasResumo
  };

  let naoLidas = 0;
  try {
    naoLidas = await contarNaoLidas();
  } catch {
    naoLidas = 0;
  }
  vazio.naoLidas = naoLidas;

  if (!process.env.ASAAS_API_KEY) return vazio;

  try {
    const [assinaturas, pagamentos, pagosDesde] = await Promise.all([
      listarAssinaturas(),
      listarPagamentosRecentes(),
      listarPagamentosDesde(isoData(inicioMes(new Date(Date.now() - 62 * 24 * 60 * 60 * 1000))))
    ]);

    const ativas = assinaturas.filter((a) => String(a.status).toUpperCase() === "ACTIVE");
    const mrr = ativas.reduce((acc, a) => acc + mrrDeAssinatura(a), 0);
    const porPlano = {};
    for (const a of ativas) {
      const chave = a.planoId || "outro";
      porPlano[chave] = (porPlano[chave] || 0) + 1;
    }

    const agora = new Date();
    const mesAtualIni = inicioMes(agora);
    const mesAtualKey = `${mesAtualIni.getFullYear()}-${String(mesAtualIni.getMonth() + 1).padStart(2, "0")}`;
    const mesAnt = new Date(mesAtualIni.getFullYear(), mesAtualIni.getMonth() - 1, 1);
    const mesAntKey = `${mesAnt.getFullYear()}-${String(mesAnt.getMonth() + 1).padStart(2, "0")}`;

    let recebidoMes = 0;
    let recebidoMesAnterior = 0;
    let countMes = 0;

    for (const p of pagosDesde) {
      if (!STATUS_PAGO.has(p.status)) continue;
      const dataPag = p.paymentDate || p.clientPaymentDate || p.dueDate;
      if (!dataPag) continue;
      const key = String(dataPag).slice(0, 7);
      const valor = Number(p.value) || 0;
      if (key === mesAtualKey) {
        recebidoMes += valor;
        countMes += 1;
      } else if (key === mesAntKey) {
        recebidoMesAnterior += valor;
      }
    }

    let variacaoPct = null;
    if (recebidoMesAnterior > 0) {
      variacaoPct = ((recebidoMes - recebidoMesAnterior) / recebidoMesAnterior) * 100;
    } else if (recebidoMes > 0) {
      variacaoPct = 100;
    }

    const vencidosLista = pagamentos.filter((p) => String(p.status).toUpperCase() === "OVERDUE");
    const vencidos = {
      quantidade: vencidosLista.length,
      soma: vencidosLista.reduce((acc, p) => acc + (Number(p.valor) || 0), 0)
    };

    const emailParaSlug = new Map();
    for (const pg of paginas) {
      if (pg.email_cobranca) emailParaSlug.set(pg.email_cobranca, pg.slug);
    }
    const pagamentosRecentes = pagamentos.slice(0, 12).map((p) => ({
      ...p,
      slugPagina: null
    }));

    return {
      mrr: Math.round(mrr * 100) / 100,
      assinaturasAtivas: ativas.length,
      porPlano,
      recebidoMes: Math.round(recebidoMes * 100) / 100,
      recebidoMesAnterior: Math.round(recebidoMesAnterior * 100) / 100,
      variacaoPct: variacaoPct == null ? null : Math.round(variacaoPct * 10) / 10,
      ticketMedio: countMes ? Math.round((recebidoMes / countMes) * 100) / 100 : 0,
      vencidos,
      naoLidas,
      pagamentosRecentes,
      paginas: paginasResumo,
      emailParaSlug: Object.fromEntries(emailParaSlug)
    };
  } catch (erro) {
    console.error("resumo Asaas:", erro.message || erro);
    return vazio;
  }
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const acao = url.searchParams.get("acao") || "listar";

  try {
    if (req.method === "POST" && acao === "login") {
      const body = await lerJsonBody(req);
      if (!adminSenhaOk(body.senha)) {
        return json(res, 401, { erro: "Senha incorreta." });
      }
      const token = emitirSessaoAdmin(14);
      const secure = process.env.VERCEL ? "; Secure" : "";
      res.setHeader(
        "Set-Cookie",
        `myrep_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 24 * 60 * 60}${secure}`
      );
      return json(res, 200, { ok: true, token });
    }

    if (req.method === "POST" && acao === "logout") {
      const secure = process.env.VERCEL ? "; Secure" : "";
      res.setHeader(
        "Set-Cookie",
        `myrep_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
      );
      return json(res, 200, { ok: true });
    }

    exigirAdmin(req);

    if (req.method === "GET" && acao === "listar") {
      const acessosPromise = listarAcessos({ limit: 50 });
      const paginasPromise = listarPaginas().catch((erro) => {
        console.error("admin páginas:", erro.message || erro);
        return [];
      });
      let assinaturas = [];
      let pagamentos = [];
      if (process.env.ASAAS_API_KEY) {
        try {
          [assinaturas, pagamentos] = await Promise.all([
            listarAssinaturas(),
            listarPagamentosRecentes()
          ]);
        } catch (erroAsaas) {
          console.error("admin Asaas:", erroAsaas.message || erroAsaas);
        }
      }
      const [acessos, paginas] = await Promise.all([acessosPromise, paginasPromise]);
      const emailParaPagina = {};
      for (const p of paginas) {
        if (p.email_cobranca) {
          emailParaPagina[p.email_cobranca] = {
            slug: p.slug,
            situacao: p.situacao,
            situacaoLabel: p.situacaoLabel,
            ativo: p.ativo !== false,
            controle_manual: p.controle_manual === true
          };
        }
      }
      const assinaturasComPagina = assinaturas.map((a) => {
        const email = normalizarEmail(a.cliente?.email);
        const pagina = email ? emailParaPagina[email] || null : null;
        return { ...a, pagina };
      });
      return json(res, 200, {
        ok: true,
        assinaturas: assinaturasComPagina,
        pagamentos,
        acessos,
        paginas,
        emailParaPagina,
        planos: PLANOS
      });
    }

    if (req.method === "GET" && acao === "resumo") {
      const resumo = await calcularResumo();
      return json(res, 200, { ok: true, resumo });
    }

    if (req.method === "GET" && acao === "inbox") {
      const resultado = await listarMensagens({
        tipo: url.searchParams.get("tipo") || "",
        status: url.searchParams.get("status") || "",
        busca: url.searchParams.get("busca") || "",
        limit: url.searchParams.get("limit") || 50,
        offset: url.searchParams.get("offset") || 0
      });
      return json(res, 200, { ok: true, ...resultado });
    }

    if (req.method === "GET" && acao === "mensagem") {
      const id = url.searchParams.get("id") || "";
      const mensagem = await obterMensagem(id);
      if (!mensagem) return json(res, 404, { erro: "Mensagem não encontrada." });
      if (!mensagem.lida) {
        await marcarLida(id, true);
        mensagem.lida = true;
      }
      return json(res, 200, { ok: true, mensagem });
    }

    if (req.method === "POST" && acao === "mensagem-lida") {
      const body = await lerJsonBody(req);
      const id = String(body.id || "").trim();
      const lida = body.lida !== false;
      const mensagem = await marcarLida(id, lida);
      if (!mensagem) return json(res, 404, { erro: "Mensagem não encontrada." });
      return json(res, 200, { ok: true, mensagem });
    }

    if (req.method === "POST" && acao === "mensagem-status") {
      const body = await lerJsonBody(req);
      const id = String(body.id || "").trim();
      const status = String(body.status || "").trim();
      const mensagem = await mudarStatus(id, status);
      if (!mensagem) return json(res, 404, { erro: "Mensagem não encontrada." });

      if (status === "publicada") {
        const slug = mensagem.slug || mensagem.dados?.slug;
        const email =
          mensagem.remetente_email ||
          mensagem.dados?.emailCliente ||
          mensagem.dados?.acesso?.email;
        if (slug && email) {
          try {
            await associarEmailSeVazio(slug, email);
          } catch (erroAssoc) {
            console.error("associar e-mail publicada:", erroAssoc.message || erroAssoc);
          }
        }
      }

      return json(res, 200, { ok: true, mensagem });
    }

    if (req.method === "GET" && acao === "paginas") {
      const paginas = await listarPaginas();
      return json(res, 200, { ok: true, paginas });
    }

    if (req.method === "POST" && acao === "pagina-email") {
      const body = await lerJsonBody(req);
      const slug = normalizarSlug(body.slug);
      const email = normalizarEmail(body.email);
      if (!slug) return json(res, 400, { erro: "Slug inválido." });
      if (body.email && !email) return json(res, 400, { erro: "E-mail inválido." });
      const pagina = await salvarMeta(slug, { email_cobranca: email || null });
      return json(res, 200, { ok: true, pagina });
    }

    if (req.method === "POST" && acao === "pagina-ativo") {
      const body = await lerJsonBody(req);
      const slug = normalizarSlug(body.slug);
      if (!slug) return json(res, 400, { erro: "Slug inválido." });
      const ativo = body.ativo !== false && body.ativo !== "false";
      const patch = { ativo, controle_manual: true };
      if (ativo) patch.inadimplente_desde = null;
      const meta = await salvarMeta(slug, patch);
      const sit = situacaoDe(meta);
      return json(res, 200, {
        ok: true,
        pagina: {
          ...meta,
          situacao: sit.codigo,
          situacaoLabel: sit.label,
          diasInadimplente: sit.diasInadimplente,
          diasCarencia: sit.diasCarencia
        }
      });
    }

    if (req.method === "POST" && acao === "pagina-automatico") {
      const body = await lerJsonBody(req);
      const slug = normalizarSlug(body.slug);
      if (!slug) return json(res, 400, { erro: "Slug inválido." });
      await salvarMeta(slug, { controle_manual: false });
      const { pagina, resultado } = await sincronizarPaginaSlug(slug);
      return json(res, 200, { ok: true, pagina, resultado });
    }

    if (req.method === "POST" && acao === "sincronizar-paginas") {
      const resultado = await sincronizarPaginas();
      return json(res, 200, { ok: true, ...resultado });
    }

    if (req.method === "POST" && acao === "mensagem-excluir") {
      const body = await lerJsonBody(req);
      const id = String(body.id || "").trim();
      const ok = await excluirMensagem(id);
      if (!ok) return json(res, 404, { erro: "Mensagem não encontrada." });
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && acao === "liberar") {
      const body = await lerJsonBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const plano = String(body.plano || "mensal").trim();
      const paymentId = String(body.paymentId || "manual").trim();

      if (!email || !email.includes("@")) {
        return json(res, 400, { erro: "E-mail inválido." });
      }
      if (!PLANOS[plano]) {
        return json(res, 400, { erro: "Plano inválido." });
      }

      const token = emitirToken({ email, plano, paymentId, dias: 14 });
      await registrarAcesso({
        email,
        plano,
        paymentId,
        asaasCustomerId: null,
        token,
        dias: 14,
        origem: "admin"
      });
      return json(res, 200, {
        ok: true,
        token,
        briefingUrl: `/briefing/?acesso=${encodeURIComponent(token)}`,
        email,
        plano
      });
    }

    if (req.method === "POST" && acao === "cancelar") {
      const body = await lerJsonBody(req);
      const id = String(body.subscriptionId || "").trim();
      if (!id) return json(res, 400, { erro: "Informe subscriptionId." });

      await asaasFetch(`/subscriptions/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && acao === "cliente") {
      const email = url.searchParams.get("email") || "";
      const id = url.searchParams.get("id") || "";
      let cliente = null;
      if (id) {
        cliente = await asaasFetch(`/customers/${encodeURIComponent(id)}`);
      } else if (email) {
        cliente = await buscarClientePorEmail(email);
      }
      if (!cliente) return json(res, 404, { erro: "Cliente não encontrado." });
      return json(res, 200, { ok: true, cliente });
    }

    return json(res, 400, { erro: "Ação inválida." });
  } catch (erro) {
    console.error("admin:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro no painel." });
  }
};
