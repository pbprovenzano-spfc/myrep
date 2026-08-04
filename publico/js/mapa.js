/* =========================================================
   Drill-down do mapa de atuação (Brasil → UF).
   Só age em blocos com data-mapa="drill".
   ========================================================= */

(function () {
  "use strict";

  function ativar(bloco) {
    const painelBrasil = bloco.querySelector('[data-vista="brasil"]');
    const paineisUf = Array.from(bloco.querySelectorAll(".mapa-painel--uf"));
    const voltar = bloco.querySelector(".mapa__voltar");
    if (!painelBrasil || !paineisUf.length) return;

    function mostrar(vista) {
      const ehBrasil = vista === "brasil";
      painelBrasil.hidden = !ehBrasil;
      for (const p of paineisUf) p.hidden = p.getAttribute("data-vista") !== vista;
      if (voltar) {
        voltar.hidden = ehBrasil;
        if (!ehBrasil) voltar.focus({ preventScroll: true });
      }
    }

    function abrirUf(uf) {
      if (!uf) return;
      const existe = paineisUf.some((p) => p.getAttribute("data-vista") === uf);
      if (!existe) return;
      mostrar(uf);
    }

    painelBrasil.addEventListener("click", (ev) => {
      const path = ev.target.closest("path.mapa__area--ativa[data-uf]");
      if (!path) return;
      abrirUf(path.getAttribute("data-uf"));
    });

    painelBrasil.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const path = ev.target.closest("path.mapa__area--ativa[data-uf]");
      if (!path) return;
      ev.preventDefault();
      abrirUf(path.getAttribute("data-uf"));
    });

    if (voltar) {
      voltar.addEventListener("click", () => mostrar("brasil"));
    }
  }

  document.querySelectorAll('[data-mapa="drill"]').forEach(ativar);
})();
