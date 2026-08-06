/* =========================================================
   /api/painel — checkout, briefing, alteracoes, pagina
   Rewrites: /api/painel/<acao> → ?acao=<acao>
   ========================================================= */

const { json } = require("./_lib/pagamento");

function acaoDe(req) {
  const url = new URL(req.url, "http://localhost");
  const q = url.searchParams.get("acao");
  if (q) return String(q).trim().toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  const partes = path.split("/").filter(Boolean);
  const ultimo = partes[partes.length - 1] || "";
  if (["checkout", "briefing", "alteracoes", "pagina"].includes(ultimo)) return ultimo;
  return "";
}

module.exports = async function handler(req, res) {
  const acao = acaoDe(req);
  if (acao === "checkout") {
    return require("./_lib/handlers/painel-checkout")(req, res);
  }
  if (acao === "briefing") {
    return require("./_lib/handlers/painel-briefing")(req, res);
  }
  if (acao === "alteracoes") {
    return require("./_lib/handlers/painel-alteracoes")(req, res);
  }
  if (acao === "pagina") {
    return require("./_lib/handlers/painel-pagina")(req, res);
  }
  return json(res, 400, {
    erro: "Ação inválida. Use checkout, briefing, alteracoes ou pagina."
  });
};

// Multipart (briefing / alteracoes / pagina) — não parsear body automaticamente
module.exports.config = {
  api: {
    bodyParser: false
  }
};
