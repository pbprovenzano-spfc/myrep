/* =========================================================
   /api/painel — checkout, pagina, slug, suporte
   ========================================================= */

const { json } = require("./_lib/pagamento");

function acaoDe(req) {
  const url = new URL(req.url, "http://localhost");
  const q = url.searchParams.get("acao");
  if (q) return String(q).trim().toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  const partes = path.split("/").filter(Boolean);
  const ultimo = partes[partes.length - 1] || "";
  if (["checkout", "pagina", "slug", "suporte"].includes(ultimo)) return ultimo;
  return "";
}

module.exports = async function handler(req, res) {
  const acao = acaoDe(req);
  if (acao === "checkout") {
    return require("./_lib/handlers/painel-checkout")(req, res);
  }
  if (acao === "pagina") {
    return require("./_lib/handlers/painel-pagina")(req, res);
  }
  if (acao === "slug") {
    return require("./_lib/handlers/painel-slug")(req, res);
  }
  if (acao === "suporte") {
    return require("./_lib/handlers/painel-suporte")(req, res);
  }
  return json(res, 400, {
    erro: "Ação inválida. Use checkout, pagina, slug ou suporte."
  });
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
