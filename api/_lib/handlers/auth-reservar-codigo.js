/* =========================================================
   POST /api/auth/reservar-codigo — reserva código vitalício no cadastro
   ========================================================= */

const { lerJsonBody, json } = require("../pagamento");
const { reservarCodigo, normalizarCodigo } = require("../codigos-vitalicios");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { erro: "Método não permitido" });
  }

  try {
    const body = await lerJsonBody(req);
    const codigo = normalizarCodigo(body.codigo);
    const email = String(body.email || "").trim().toLowerCase();

    if (!codigo) {
      return json(res, 400, { erro: "Informe o código." });
    }
    if (!email.includes("@")) {
      return json(res, 400, { erro: "Informe um e-mail válido." });
    }

    const reserva = await reservarCodigo(codigo, email);
    return json(res, 200, { ok: true, codigo: reserva });
  } catch (erro) {
    return json(res, erro.status || 500, { erro: erro.message || "Erro ao reservar código." });
  }
};
