/* =========================================================
   POST /api/painel/briefing — briefing autenticado
   ========================================================= */

const { PLANOS, json } = require("../pagamento");
const { lerZip } = require("../zip");
const {
  criarMensagem,
  salvarAnexos,
  mimePorNome,
  nomeArquivoSeguro
} = require("../inbox");
const { associarEmailSeVazio } = require("../paginas");
const { exigirUsuario } = require("../auth");
const {
  obterAssinaturaPorUserId,
  vincularUserIdNaPagina
} = require("../assinaturas");

const MAX_BYTES = 25 * 1024 * 1024;

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        reject(Object.assign(new Error("Pacote muito grande (máx. 25 MB)."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  const boundary = m && (m[1] || m[2]);
  if (!boundary) throw Object.assign(new Error("Content-Type inválido."), { status: 400 });

  const sep = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(sep) + sep.length;

  while (start < buffer.length) {
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const next = buffer.indexOf(sep, start);
    if (next < 0) break;

    let part = buffer.slice(start, next);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.slice(0, -2);
    }

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const headers = part.slice(0, headerEnd).toString("utf8");
      const body = part.slice(headerEnd + 4);
      const nameMatch = /name="([^"]+)"/i.exec(headers);
      const fileMatch = /filename="([^"]*)"/i.exec(headers);
      if (nameMatch) {
        parts.push({
          name: nameMatch[1],
          filename: fileMatch ? fileMatch[1] : null,
          data: body
        });
      }
    }

    start = next + sep.length;
  }

  return parts;
}

function resumoTerritorio(dados) {
  if (!dados || typeof dados !== "object") return null;
  const estados = Array.isArray(dados.estados)
    ? dados.estados.map((u) => String(u).toUpperCase())
    : [];
  const linhas = [];
  if (estados.length) linhas.push(`Estados: ${estados.join(", ")}`);

  const cidades = dados.cidades;
  if (Array.isArray(cidades) && cidades.length) {
    linhas.push(`Cidades: ${cidades.join(", ")}`);
  } else if (cidades && typeof cidades === "object") {
    const partes = Object.entries(cidades)
      .filter(([, lista]) => Array.isArray(lista) && lista.length)
      .map(([uf, lista]) => `${String(uf).toUpperCase()}: ${lista.join(", ")}`);
    if (partes.length) linhas.push(`Cidades: ${partes.join(" | ")}`);
  }

  return linhas.length ? linhas.join("\n") : null;
}

function extrairDadosDoZip(zipBuffer, slug) {
  const entradas = lerZip(zipBuffer);
  let dados = null;
  const anexos = [];

  for (const entrada of entradas) {
    const nome = entrada.nome.replace(/^\/+/, "");
    if (nome === `clientes/${slug}.json` || nome.endsWith(`/${slug}.json`) || nome.endsWith(".json")) {
      if (!dados) {
        try {
          dados = JSON.parse(entrada.data.toString("utf8"));
        } catch {
          /* ignora */
        }
      }
      continue;
    }

    const prefixo = `assets-clientes/${slug}/`;
    let nomeArquivo = null;
    if (nome.startsWith(prefixo)) {
      nomeArquivo = nome.slice(prefixo.length);
    } else if (nome.startsWith("assets-clientes/") && nome.includes("/")) {
      nomeArquivo = nome.split("/").pop();
    } else if (!nome.includes("/")) {
      nomeArquivo = nome;
    }

    if (nomeArquivo && !nomeArquivo.includes("/")) {
      anexos.push({
        nome: nomeArquivoSeguro(nomeArquivo),
        data: entrada.data,
        mime: mimePorNome(nomeArquivo),
        origem: "zip"
      });
    }
  }

  anexos.push({
    nome: `${slug}-myrep.zip`,
    data: zipBuffer,
    mime: "application/zip",
    origem: "upload"
  });

  return { dados, anexos };
}

function assinaturaLibera(assinatura) {
  if (!assinatura) return false;
  return assinatura.status === "ativa" || assinatura.status === "inadimplente";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const { user } = await exigirUsuario(req);
    const email = String(user.email || "")
      .trim()
      .toLowerCase();

    const assinatura = await obterAssinaturaPorUserId(user.id);
    const pagamentoAtivo = !!(process.env.PAGAMENTO_TOKEN_SECRET || process.env.ASAAS_API_KEY);
    if (pagamentoAtivo && !assinaturaLibera(assinatura)) {
      return json(res, 402, {
        erro: "Assinatura necessária. Escolha um plano e conclua o pagamento."
      });
    }

    const raw = await lerCorpo(req);
    const parts = parseMultipart(raw, req.headers["content-type"]);

    const campo = (nome) => {
      const p = parts.find((x) => x.name === nome && !x.filename);
      return p ? p.data.toString("utf8").trim() : "";
    };

    const zipPart = parts.find((x) => x.name === "zip");
    const slug = campo("slug")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80);
    const nome = campo("nome");
    const aceiteTermos = campo("aceiteTermos");

    if (aceiteTermos !== "1" && aceiteTermos.toLowerCase() !== "true") {
      return json(res, 400, { erro: "É necessário aceitar os termos de uso." });
    }
    if (!slug || !nome) {
      return json(res, 400, { erro: "Faltam slug ou nome." });
    }
    if (!zipPart || !zipPart.data.length) {
      return json(res, 400, { erro: "ZIP ausente." });
    }

    const planoNome = assinatura
      ? PLANOS[assinatura.plano]?.nome || assinatura.plano
      : null;

    let dadosJson = null;
    let anexosInbox = [];
    try {
      const extraido = extrairDadosDoZip(zipPart.data, slug);
      dadosJson = extraido.dados;
      anexosInbox = extraido.anexos;
    } catch (erroZip) {
      console.error("painel briefing zip:", erroZip.message || erroZip);
      anexosInbox = [
        {
          nome: `${slug}-myrep.zip`,
          data: zipPart.data,
          mime: "application/zip",
          origem: "upload"
        }
      ];
    }

    const territorio = resumoTerritorio(dadosJson);
    const assunto = `My Rep briefing — ${nome} (${slug})`;
    const texto = [
      `Novo briefing My Rep (painel autenticado).`,
      ``,
      `Nome: ${nome}`,
      `Slug: ${slug}`,
      `E-mail da conta: ${email}`,
      `User ID: ${user.id}`,
      planoNome ? `Plano: ${planoNome}` : null,
      territorio ? `` : null,
      territorio,
      ``,
      `Anexo: pacote padrão (clientes/${slug}.json + assets-clientes/${slug}/).`
    ]
      .filter((linha) => linha != null)
      .join("\n");

    const dadosMensagem = {
      ...(dadosJson && typeof dadosJson === "object" ? dadosJson : {}),
      slug,
      nome,
      emailCliente: email,
      userId: user.id,
      acesso: assinatura
        ? {
            email,
            plano: assinatura.plano,
            paymentId: assinatura.asaas_payment_id
          }
        : null
    };

    const mensagem = await criarMensagem({
      tipo: "briefing",
      assunto,
      remetenteNome: nome,
      remetenteEmail: email,
      slug,
      userId: user.id,
      dados: dadosMensagem,
      corpo: texto
    });

    if (mensagem?.id && anexosInbox.length) {
      await salvarAnexos(mensagem.id, anexosInbox);
    }

    try {
      await associarEmailSeVazio(slug, email);
      await vincularUserIdNaPagina(slug, user.id, email);
    } catch (erroAssoc) {
      console.error("painel briefing vincular:", erroAssoc.message || erroAssoc);
    }

    if (!mensagem?.id) {
      return json(res, 500, { erro: "Falha ao gravar briefing na inbox." });
    }

    return json(res, 200, { ok: true, mensagemId: mensagem.id });
  } catch (erro) {
    console.error("painel briefing:", erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro interno." });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
