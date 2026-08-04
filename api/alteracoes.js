/* =========================================================
   POST /api/alteracoes
   Solicitação de alteração (multipart) → e-mail via Resend.
   ========================================================= */

const { Resend } = require("resend");
const { json } = require("./_lib/pagamento");

const MAX_BYTES = 4.5 * 1024 * 1024;
const MAX_ANEXO = 3.5 * 1024 * 1024;

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

function nomeArquivoSeguro(nome, fallback) {
  const base = String(nome || fallback || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base || fallback || "arquivo";
}

function anexoDeParte(part, prefixo) {
  if (!part || !part.filename || !part.data || !part.data.length) return null;
  if (part.data.length > MAX_ANEXO) {
    throw Object.assign(new Error(`Arquivo grande demais: ${part.filename}`), { status: 413 });
  }
  const original = part.filename.replace(/[/\\]/g, "").slice(0, 120) || "arquivo";
  return {
    filename: `${prefixo}-${nomeArquivoSeguro(original, "arquivo")}`,
    content: part.data.toString("base64")
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const raw = await lerCorpo(req);
    const parts = parseMultipart(raw, req.headers["content-type"]);

    const campo = (nome) => {
      const p = parts.find((x) => x.name === nome && !x.filename);
      return p ? p.data.toString("utf8").trim() : "";
    };
    const arquivo = (nome) => parts.find((x) => x.name === nome && x.filename);

    const email = campo("email").toLowerCase();
    const slug = campo("slug")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 80);
    const mensagem = campo("mensagem").slice(0, 4000);

    const catalogoAddNome = campo("catalogo_add_nome").slice(0, 120);
    const catalogoTrocaNome = campo("catalogo_troca_nome").slice(0, 120);
    const catalogoRemover = campo("catalogo_remover").slice(0, 120);
    const logoAddNome = campo("logo_add_nome").slice(0, 120);
    const logoRemover = campo("logo_remover").slice(0, 120);

    const catalogoAddArquivo = arquivo("catalogo_add_arquivo");
    const catalogoTrocaArquivo = arquivo("catalogo_troca_arquivo");
    const logoAddArquivo = arquivo("logo_add_arquivo");

    if (!email || !email.includes("@") || email.length > 160) {
      return json(res, 400, { erro: "Informe o e-mail usado no cadastro." });
    }

    const acoes = [];
    if (catalogoAddNome || (catalogoAddArquivo && catalogoAddArquivo.filename)) {
      acoes.push(
        `Adicionar catálogo: ${catalogoAddNome || "(sem nome)"}${
          catalogoAddArquivo && catalogoAddArquivo.filename ? ` · arquivo: ${catalogoAddArquivo.filename}` : ""
        }`
      );
    }
    if (catalogoTrocaNome || (catalogoTrocaArquivo && catalogoTrocaArquivo.filename)) {
      acoes.push(
        `Substituir catálogo: ${catalogoTrocaNome || "(sem nome)"}${
          catalogoTrocaArquivo && catalogoTrocaArquivo.filename
            ? ` · novo arquivo: ${catalogoTrocaArquivo.filename}`
            : ""
        }`
      );
    }
    if (catalogoRemover) acoes.push(`Remover catálogo: ${catalogoRemover}`);
    if (logoAddNome || (logoAddArquivo && logoAddArquivo.filename)) {
      acoes.push(
        `Adicionar/atualizar logo: ${logoAddNome || "(sem nome)"}${
          logoAddArquivo && logoAddArquivo.filename ? ` · arquivo: ${logoAddArquivo.filename}` : ""
        }`
      );
    }
    if (logoRemover) acoes.push(`Remover logo/marca: ${logoRemover}`);
    if (mensagem.length >= 3) acoes.push("Pedido em texto livre (ver abaixo).");

    if (!acoes.length) {
      return json(res, 400, {
        erro: "Preencha ao menos uma ação rápida ou descreva o que precisa alterar."
      });
    }

    const anexos = [
      anexoDeParte(catalogoAddArquivo, "catalogo-novo"),
      anexoDeParte(catalogoTrocaArquivo, "catalogo-troca"),
      anexoDeParte(logoAddArquivo, "logo")
    ].filter(Boolean);

    const apiKey = process.env.RESEND_API_KEY;
    const para = process.env.BRIEFING_TO_EMAIL;
    const de = process.env.BRIEFING_FROM_EMAIL || "My Rep <onboarding@resend.dev>";

    if (!apiKey || !para) {
      return json(res, 500, {
        erro: "Servidor sem RESEND_API_KEY ou BRIEFING_TO_EMAIL configurados."
      });
    }

    const assunto = `My Rep alteração — ${slug || email}`;
    const texto = [
      `Solicitação de alteração de página My Rep.`,
      ``,
      `E-mail do cadastro: ${email}`,
      slug ? `Slug / página: ${slug}` : null,
      ``,
      `Ações:`,
      ...acoes.map((a) => `• ${a}`),
      mensagem ? `` : null,
      mensagem ? `Detalhes do cliente:` : null,
      mensagem || null,
      anexos.length ? `` : null,
      anexos.length ? `Anexos: ${anexos.map((a) => a.filename).join(", ")}` : null
    ]
      .filter((linha) => linha !== null)
      .join("\n");

    const resend = new Resend(apiKey);
    const payload = {
      from: de,
      to: [para],
      replyTo: email,
      subject: assunto,
      text: texto
    };
    if (anexos.length) payload.attachments = anexos;

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      console.error("Resend alterações:", error);
      return json(res, 502, { erro: error.message || "Falha ao enviar e-mail." });
    }

    return json(res, 200, { ok: true, id: data && data.id });
  } catch (erro) {
    console.error(erro);
    return json(res, erro.status || 500, { erro: erro.message || "Erro interno." });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
