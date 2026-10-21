/* =========================================================
   pagamento.js — mensagem após retorno da Asaas
   ========================================================= */

(function () {
  const planoTexto = document.getElementById("pagamento-plano-texto");
  if (!planoTexto) return;

  const NOMES = {
    mensal: "Mensal (R$ 17,90/mês)",
    anual: "Anual (R$ 130,80 · 12× R$ 10,90)"
  };

  const plano = new URLSearchParams(location.search).get("plano") || "";

  if (NOMES[plano]) {
    planoTexto.textContent = `Plano ${NOMES[plano]}. Assim que a Asaas confirmar o pagamento, sua assinatura é ativada — no cartão leva segundos; no PIX, até alguns minutos. Entre no painel com a mesma conta para montar e publicar sua página.`;
  }
})();
