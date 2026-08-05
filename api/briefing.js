/* =========================================================
   POST /api/briefing
   Recebe ZIP do formulário → inbox interna (dashboard).
   ========================================================= */

const { lerToken, PLANOS } = require("./_lib/pagamento");
const { lerZip } = require("./_lib/zip");
const {
  criarMensagem,
  salvarAnexos,
  mimePorNome,
  nomeArquivoSeguro
} = require("./_lib/inbox");
const { associarEmailSeVazio } = require("./_lib/paginas");

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
          /* ignora JSON inválido */
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

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ erro: "Método não permitido" }));
    return;
  }

  try {
    const raw = await lerCorpo(req);
    const parts = parseMultipart(raw, req.headers["content-type"]);

    const campo = (nome) => {
      const p = parts.find((x) => x.name === nome && !x.filename);
      return p ? p.data.toString("utf8").trim() : "";
    };

    const zipPart = parts.find((x) => x.name === "zip");
    const slug = campo("slug");
    const nome = campo("nome");
    const emailCliente = campo("emailCliente");
    const acesso = campo("acesso");
    const aceiteTermos = campo("aceiteTermos");

    if (aceiteTermos !== "1" && aceiteTermos.toLowerCase() !== "true") {
      res.statusCode = 400;
      res.end(JSON.stringify({ erro: "É necessário aceitar os termos de uso." }));
      return;
    }

    const pagamentoAtivo = !!(process.env.PAGAMENTO_TOKEN_SECRET || process.env.ASAAS_API_KEY);
    let acessoDados = null;
    if (pagamentoAtivo) {
      try {
        acessoDados = lerToken(acesso);
      } catch (erroAcesso) {
        res.statusCode = erroAcesso.status || 401;
        res.end(JSON.stringify({ erro: erroAcesso.message || "Pagamento necessário antes do briefing." }));
        return;
      }
    }

    if (!slug || !nome) {
      res.statusCode = 400;
      res.end(JSON.stringify({ erro: "Faltam slug ou nome." }));
      return;
    }

    if (!zipPart || !zipPart.data.length) {
      res.statusCode = 400;
      res.end(JSON.stringify({ erro: "ZIP ausente." }));
      return;
    }

    const planoNome = acessoDados
      ? PLANOS[acessoDados.plano]?.nome || acessoDados.plano
      : null;

    const assunto = `My Rep briefing — ${nome} (${slug})`;
    let dadosJson = null;
    let anexosInbox = [];
    try {
      const extraido = extrairDadosDoZip(zipPart.data, slug);
      dadosJson = extraido.dados;
      anexosInbox = extraido.anexos;
    } catch (erroZip) {
      console.error("briefing zip:", erroZip.message || erroZip);
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
    const texto = [
      `Novo briefing My Rep.`,
      ``,
      `Nome: ${nome}`,
      `Slug: ${slug}`,
      emailCliente ? `E-mail do cliente: ${emailCliente}` : null,
      acessoDados ? `E-mail do pagamento: ${acessoDados.email}` : null,
      planoNome ? `Plano: ${planoNome}` : null,
      acessoDados ? `Pagamento Asaas: ${acessoDados.paymentId}` : null,
      territorio ? `` : null,
      territorio,
      ``,
      `Anexo: pacote padrão (clientes/${slug}.json + assets-clientes/${slug}/).`,
      `Descompacte na raiz do projeto e envie para gerar a página.`
    ]
      .filter((linha) => linha != null)
      .join("\n");

    const dadosMensagem = {
      ...(dadosJson && typeof dadosJson === "object" ? dadosJson : {}),
      slug,
      nome,
      emailCliente: emailCliente || null,
      acesso: acessoDados
        ? {
            email: acessoDados.email,
            plano: acessoDados.plano,
            paymentId: acessoDados.paymentId
          }
        : null
    };

    let mensagem = null;
    try {
      mensagem = await criarMensagem({
        tipo: "briefing",
        assunto,
        remetenteNome: nome,
        remetenteEmail: emailCliente || acessoDados?.email || null,
        slug,
        dados: dadosMensagem,
        corpo: texto
      });
      if (mensagem?.id && anexosInbox.length) {
        await salvarAnexos(mensagem.id, anexosInbox);
      }
      const emailAssoc = emailCliente || acessoDados?.email || null;
      if (mensagem?.id && slug && emailAssoc) {
        try {
          await associarEmailSeVazio(slug, emailAssoc);
        } catch (erroAssoc) {
          console.error("briefing associar e-mail:", erroAssoc.message || erroAssoc);
        }
      }
    } catch (erroInbox) {
      console.error("briefing inbox:", erroInbox.message || erroInbox);
    }

    if (!mensagem?.id) {
      res.statusCode = 500;
      res.end(JSON.stringify({ erro: "Falha ao gravar briefing na inbox." }));
      return;
    }

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        mensagemId: mensagem.id
      })
    );
  } catch (erro) {
    console.error(erro);
    res.statusCode = erro.status || 500;
    res.end(JSON.stringify({ erro: erro.message || "Erro interno." }));
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
