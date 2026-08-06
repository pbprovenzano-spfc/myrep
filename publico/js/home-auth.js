/* Home: se logado, planos apontam para /painel/?plano= */
(function () {
  function tick(n) {
    if (!window.MyRepAuth || !window.MyRepAuth.pronto()) {
      if (n < 40) setTimeout(() => tick(n + 1), 50);
      return;
    }
    window.MyRepAuth.sessaoAtual().then((sessao) => {
      if (!sessao) return;
      document.querySelectorAll("a[data-plano]").forEach((a) => {
        const plano = a.getAttribute("data-plano");
        if (plano) a.href = `/painel/?plano=${encodeURIComponent(plano)}`;
      });
      const criar = document.querySelector('.hero__ctas a.btn--primario[href="/cadastro/"]');
      if (criar) criar.href = "/painel/";
      const ja = document.querySelector('.hero__ctas a[href="/entrar/"]');
      if (ja) {
        ja.href = "/painel/";
        ja.textContent = "Meu painel";
      }
    });
  }
  tick(0);
})();
