/* =========================================================
   Busca do diretório /representantes.
   Filtra fichas já no HTML — funciona sem JS também.
   ========================================================= */

(function () {
  "use strict";

  const campo = document.getElementById("busca");
  const lista = document.getElementById("fichas");
  const vazio = document.getElementById("vazio");
  const contagem = document.getElementById("contagem");

  if (!campo || !lista) return;

  const fichas = Array.from(lista.querySelectorAll(".ficha"));
  const total = fichas.length;

  const normalizar = (s) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  function atualizarContagem(visiveis) {
    if (!contagem) return;
    if (visiveis === total) {
      contagem.textContent = total + (total === 1 ? " representante" : " representantes");
    } else {
      contagem.textContent = visiveis + " de " + total;
    }
  }

  function filtrar() {
    const termo = normalizar(campo.value);
    let visiveis = 0;

    for (const ficha of fichas) {
      const chaves = normalizar(ficha.dataset.busca || "");
      const combina = termo === "" || chaves.includes(termo);
      ficha.hidden = !combina;
      if (combina) visiveis++;
    }

    if (vazio) vazio.hidden = visiveis !== 0;
    atualizarContagem(visiveis);
  }

  campo.addEventListener("input", filtrar);
  atualizarContagem(total);
})();
