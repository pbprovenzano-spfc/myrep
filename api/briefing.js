/* =========================================================
   POST /api/briefing
   Recebe ZIP do formulário e envia por e-mail via Resend.
   Em desenvolvimento local (dev.js), o ZIP é salvo em /inbox.
   ========================================================= */

const { Resend } = require("resend");
const { lerToken, PLANOS } = require("./_lib/pagamento");

const MAX_BYTES = 4.5 * 1024 * 1024;

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        reject(Object.assign(new Error("Pacote muito grande (máx. ~4 MB)."), { status: 413 }));
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
    if (buffer[start] === 45 && buffer[start + 1] === 45) break; // --
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

    const apiKey = process.env.RESEND_API_KEY;
    const para = process.env.BRIEFING_TO_EMAIL;
    const de = process.env.BRIEFING_FROM_EMAIL || "My Rep <onboarding@resend.dev>";

    if (!apiKey || !para) {
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          erro: "Servidor sem RESEND_API_KEY ou BRIEFING_TO_EMAIL configurados."
        })
      );
      return;
    }

    const resend = new Resend(apiKey);
    const arquivoZip = `${slug}-myrep.zip`;
    const assunto = `My Rep briefing — ${nome} (${slug})`;
    const planoNome = acessoDados
      ? PLANOS[acessoDados.plano]?.nome || acessoDados.plano
      : null;
    const texto = [
      `Novo briefing My Rep.`,
      ``,
      `Nome: ${nome}`,
      `Slug: ${slug}`,
      emailCliente ? `E-mail do cliente: ${emailCliente}` : null,
      acessoDados ? `E-mail do pagamento: ${acessoDados.email}` : null,
      planoNome ? `Plano: ${planoNome}` : null,
      acessoDados ? `Pagamento Asaas: ${acessoDados.paymentId}` : null,
      ``,
      `Anexo: pacote padrão (clientes/${slug}.json + assets-clientes/${slug}/).`,
      `Descompacte na raiz do projeto e envie para gerar a página.`
    ]
      .filter(Boolean)
      .join("\n");

    const { data, error } = await resend.emails.send({
      from: de,
      to: [para],
      subject: assunto,
      text: texto,
      attachments: [
        {
          filename: arquivoZip,
          content: zipPart.data.toString("base64")
        }
      ]
    });

    if (error) {
      console.error("Resend:", error);
      res.statusCode = 502;
      res.end(JSON.stringify({ erro: error.message || "Falha ao enviar e-mail." }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, id: data && data.id }));
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
