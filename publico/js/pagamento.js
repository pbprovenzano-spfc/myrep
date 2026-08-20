/* =========================================================
   pagamento.js — libera briefing após retorno da Asaas
   ========================================================= */

(function () {
  const form = document.getElementById("pagamento-form");
  const statusEl = document.getElementById("pagamento-status");
  const planoInput = document.getElementById("pagamento-plano");
  const planoTexto = document.getElementById("pagamento-plano-texto");
  const botao = document.getElementById("pagamento-enviar");

  if (!form) return;

  const NOMES = {
    mensal: "Mensal (R$ 19,90/mês)",
    anual: "Anual (R$ 202,80 · 12× R$ 16,90)"
  };

  const params = new URLSearchParams(location.search);
  const plano = params.get("plano") || "";
  planoInput.value = plano;

  if (NOMES[plano]) {
    planoTexto.textContent = `Plano ${NOMES[plano]}. Informe o e-mail usado na Asaas para liberar o briefing.`;
  } else {
    planoTexto.textContent =
      "Não identificamos o plano na URL. Volte aos planos, pague novamente ou peça liberação no suporte.";
    botao.disabled = true;
  }

  function setStatus(msg, tipo) {
    statusEl.textContent = msg || "";
    statusEl.dataset.tipo = tipo || "";
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = String(new FormData(form).get("email") || "")
      .trim()
      .toLowerCase();
    if (!email.includes("@")) return setStatus("Informe um e-mail válido.", "erro");
    if (!NOMES[plano]) return setStatus("Plano inválido. Volte aos planos.", "erro");

    botao.disabled = true;
    setStatus("Conferindo pagamento na Asaas…", "info");

    try {
      const resp = await fetch("/api/pagamento/liberar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plano })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.erro || `Falha (${resp.status})`);

      setStatus("Pagamento confirmado. Abrindo o briefing…", "ok");
      location.href = data.briefingUrl || `/briefing/?acesso=${encodeURIComponent(data.token)}`;
    } catch (erro) {
      setStatus(erro.message || "Não foi possível liberar.", "erro");
      botao.disabled = false;
    }
  });
})();
