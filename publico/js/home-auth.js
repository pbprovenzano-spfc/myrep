/* Home: se logado, CTAs apontam para o painel; trata link de auth inválido na raiz */
(function () {
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
  const code = hashParams.get("error_code") || "";
  const err = hashParams.get("error") || "";
  if (code === "otp_expired" || err === "access_denied") {
    location.replace("/entrar/?erro=link_expirado");
    return;
  }

  function tick(n) {
    if (!window.MyRepAuth || !window.MyRepAuth.pronto()) {
      if (n < 40) setTimeout(() => tick(n + 1), 50);
      return;
    }
    window.MyRepAuth.sessaoAtual().then((sessao) => {
      if (!sessao) return;
      const criar = document.querySelector('.hero__ctas a.btn--primario[href="/cadastro/"]');
      if (criar) criar.href = "/painel/";
      const ja = document.querySelector('.hero__ctas a[href="/entrar/"]');
      if (ja) {
        ja.href = "/painel/";
        ja.textContent = "Meu painel";
      }
      document.querySelectorAll('#precos a[href="/cadastro/"]').forEach((a) => {
        a.href = "/painel/";
        a.textContent = "Meu painel";
      });
      const entrarPrecos = document.querySelector('#precos .precos__rodape a[href="/entrar/"]');
      if (entrarPrecos) entrarPrecos.href = "/painel/";
    });
  }
  tick(0);
})();
