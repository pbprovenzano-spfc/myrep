/* =========================================================
   Máscaras de formulário — celular com DDD
   ========================================================= */

(function (global) {
  function formatarCelular(valor) {
    let d = String(valor || "").replace(/\D/g, "");
    if (d.startsWith("55") && d.length > 11) d = d.slice(2);
    d = d.slice(0, 11);
    if (!d) return "";
    if (d.length <= 2) return `(${d}`;
    const corte = d.length > 10 ? 7 : 6;
    if (d.length <= corte) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
  }

  function posicaoAposDigitos(formatado, qtd) {
    if (qtd <= 0) return 0;
    let contados = 0;
    for (let i = 0; i < formatado.length; i++) {
      if (/\d/.test(formatado[i])) contados++;
      if (contados >= qtd) return i + 1;
    }
    return formatado.length;
  }

  function ligarCelular(input) {
    if (!input) return;
    input.addEventListener("input", () => {
      const noFim =
        input.selectionStart === input.value.length &&
        input.selectionEnd === input.value.length;
      const digitosAntes = input.value
        .slice(0, input.selectionStart || 0)
        .replace(/\D/g, "").length;
      const formatado = formatarCelular(input.value);
      if (formatado === input.value) return;
      input.value = formatado;
      const pos = noFim ? formatado.length : posicaoAposDigitos(formatado, digitosAntes);
      input.setSelectionRange(pos, pos);
    });
    input.addEventListener("blur", () => {
      input.value = formatarCelular(input.value);
    });
  }

  global.MyRepMascaras = { formatarCelular, ligarCelular };
})(typeof window !== "undefined" ? window : globalThis);
