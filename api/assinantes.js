const {
  asaasFetch,
  emitirToken,
  lerJsonBody,
  json,
  PLANOS,
  adminSenhaOk,
  emitirSessaoAdmin,
  lerSessaoAdmin,
  cookieValor,
  valoresIguais,
  buscarClientePorEmail
} = require("./_lib/pagamento");
const { listarAcessos, registrarAcesso } = require("./_lib/acessos");

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
      let assinaturas = [];
      let pagamentos = [];
      if (process.env.ASAAS_API_KEY) {
        try {
          [assinaturas, pagamentos] = await Promise.all([
            listarAssinaturas(),
            listarPagamentosRecentes()
          ]);
        } catch (erroAsaas) {
          console.error("assinantes Asaas:", erroAsaas.message || erroAsaas);
        }
      }
      const acessos = await acessosPromise;
      return json(res, 200, { ok: true, assinaturas, pagamentos, acessos, planos: PLANOS });
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
    console.error("assinantes:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro no painel." });
  }
};
