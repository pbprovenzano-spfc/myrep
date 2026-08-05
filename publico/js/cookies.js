(function () {
  var CHAVE = "myrep_cookies";
  var banner = document.getElementById("cookies-banner");
  var btn = document.getElementById("cookies-aceitar");
  if (!banner || !btn) return;

  function esconder() {
    banner.setAttribute("hidden", "");
    banner.classList.remove("cookies--visivel");
  }

  function mostrar() {
    banner.removeAttribute("hidden");
    requestAnimationFrame(function () {
      banner.classList.add("cookies--visivel");
    });
  }

  try {
    if (localStorage.getItem(CHAVE) === "1") {
      esconder();
      return;
    }
  } catch (e) {
    /* localStorage indisponível — mostra banner */
  }

  mostrar();

  btn.addEventListener("click", function () {
    try {
      localStorage.setItem(CHAVE, "1");
    } catch (e) {
      /* ignore */
    }
    esconder();
  });
})();
