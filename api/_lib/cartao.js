/* =========================================================
   Cartão de crédito: leitura e validação antes de repassar à Asaas.
   O número do cartão nunca é registrado nem armazenado.
   ========================================================= */

function soDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function luhnOk(numero) {
  let soma = 0;
  let dobra = false;
  for (let i = numero.length - 1; i >= 0; i -= 1) {
    let d = Number(numero[i]);
    if (dobra) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    dobra = !dobra;
  }
  return soma % 10 === 0;
}

function lerCartao(body) {
  const b = body && typeof body === "object" ? body : {};
  const numero = soDigitos(b.numero);
  const mes = soDigitos(b.mes).slice(0, 2);
  let ano = soDigitos(b.ano).slice(0, 4);
  if (ano.length === 2) ano = `20${ano}`;
  return {
    titular: String(b.titular || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80),
    numero,
    mes: mes.padStart(2, "0"),
    ano,
    cvv: soDigitos(b.cvv).slice(0, 4)
  };
}

function validarCartao(cartao) {
  if (cartao.titular.length < 3) return "Informe o nome impresso no cartão.";
  if (cartao.numero.length < 13 || cartao.numero.length > 19 || !luhnOk(cartao.numero)) {
    return "Número do cartão inválido.";
  }
  const mes = Number(cartao.mes);
  if (!(mes >= 1 && mes <= 12)) return "Mês de validade inválido.";
  const ano = Number(cartao.ano);
  if (!(ano >= 2000 && ano <= 2100)) return "Ano de validade inválido.";
  const agora = new Date();
  const fimDoMes = new Date(Date.UTC(ano, mes, 1));
  if (fimDoMes <= agora) return "Este cartão já venceu.";
  if (cartao.cvv.length < 3) return "Informe o código de segurança (CVV).";
  return "";
}

function ipDoCliente(req) {
  const bruto = String(
    req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || ""
  ).split(",")[0].trim();
  if (!bruto || /^(127\.|10\.|192\.168\.|::1$)/.test(bruto)) return "";
  return bruto;
}

module.exports = { lerCartao, validarCartao, ipDoCliente };
