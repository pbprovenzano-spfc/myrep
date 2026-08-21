/* =========================================================
   auth-pages.js — cadastro / entrar / recuperar senha
   ========================================================= */

(function () {
  const params = new URLSearchParams(location.search);
  const plano = params.get("plano") || "";
  const next = params.get("next") || "";

  const MSG_LINK_EXPIRADO =
    "Este link expirou ou já foi usado. Entre na conta ou peça um novo e-mail.";

  function hashAuthParams() {
    const raw = location.hash.replace(/^#/, "");
    return raw ? new URLSearchParams(raw) : null;
  }

  function linkAuthInvalido(hashParams) {
    if (!hashParams) return false;
    const code = hashParams.get("error_code") || "";
    const err = hashParams.get("error") || "";
    return code === "otp_expired" || err === "access_denied";
  }

  function limparHash() {
    if (location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function tratarErroLinkAuth() {
    const hashParams = hashAuthParams();
    if (!linkAuthInvalido(hashParams)) return false;

    limparHash();
    if (params.get("erro") === "link_expirado") return true;

    const destino =
      location.pathname.includes("/cadastro/") ? "/cadastro/?erro=link_expirado" : "/entrar/?erro=link_expirado";
    location.replace(destino);
    return true;
  }

  if (tratarErroLinkAuth()) return;

  function destinoAposLogin() {
    if (next && next.startsWith("/")) return next;
    if (plano) return `/painel/?plano=${encodeURIComponent(plano)}`;
    return "/painel/";
  }

  function setStatus(el, msg, tipo) {
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.tipo = tipo || "";
  }

  function esperarSupabase(tentativas = 40) {
    return new Promise((resolve, reject) => {
      let n = 0;
      const tick = () => {
        if (window.MyRepAuth && window.MyRepAuth.pronto()) return resolve(window.MyRepAuth.getClient());
        if (++n >= tentativas) return reject(new Error("Supabase não configurado neste ambiente."));
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async function redirecionarSeLogado() {
    try {
      await esperarSupabase();
      const sessao = await window.MyRepAuth.sessaoAtual();
      if (sessao && (document.getElementById("form-cadastro") || document.getElementById("form-entrar"))) {
        location.replace(destinoAposLogin());
      }
    } catch {
      /* ignore */
    }
  }

  redirecionarSeLogado();

  if (params.get("erro") === "link_expirado") {
    const statusAuth = document.getElementById("auth-status");
    if (statusAuth && (document.getElementById("form-cadastro") || document.getElementById("form-entrar"))) {
      setStatus(statusAuth, MSG_LINK_EXPIRADO, "erro");
    }
  }

  /* -------- Cadastro -------- */
  const formCadastro = document.getElementById("form-cadastro");
  if (formCadastro) {
    const status = document.getElementById("auth-status");
    const btn = document.getElementById("btn-cadastro");
    formCadastro.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(formCadastro);
      const email = String(fd.get("email") || "").trim().toLowerCase();
      const senha = String(fd.get("senha") || "");
      const senha2 = String(fd.get("senha2") || "");
      const nome = String(fd.get("nome") || "").trim();
      const codigoVitalicio = String(fd.get("codigo_vitalicio") || "").trim();

      if (!email.includes("@")) return setStatus(status, "Informe um e-mail válido.", "erro");
      if (senha.length < 6) return setStatus(status, "A senha precisa ter ao menos 6 caracteres.", "erro");
      if (senha !== senha2) return setStatus(status, "As senhas não coincidem.", "erro");

      btn.disabled = true;
      setStatus(status, "Criando conta…", "info");
      try {
        if (codigoVitalicio) {
          setStatus(status, "Validando código…", "info");
          const respReserva = await fetch("/api/auth/reservar-codigo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codigo: codigoVitalicio, email })
          });
          const dataReserva = await respReserva.json().catch(() => ({}));
          if (!respReserva.ok) {
            throw new Error(dataReserva.erro || "Código inválido ou indisponível.");
          }
        }

        const sb = await esperarSupabase();
        const { data, error } = await sb.auth.signUp({
          email,
          password: senha,
          options: {
            data: nome ? { nome } : {},
            emailRedirectTo: `${location.origin}/painel/`
          }
        });
        if (error) throw error;

        if (data.session) {
          setStatus(status, "Conta criada. Redirecionando…", "ok");
          location.href = destinoAposLogin();
          return;
        }

        setStatus(
          status,
          codigoVitalicio
            ? "Conta criada. Confirme o e-mail que enviamos — o plano vitalício será ativado ao entrar."
            : "Conta criada. Confirme o e-mail que enviamos e depois entre na sua conta.",
          "ok"
        );
        formCadastro.reset();
      } catch (erro) {
        setStatus(status, erro.message || "Não foi possível criar a conta.", "erro");
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* -------- Entrar -------- */
  const formEntrar = document.getElementById("form-entrar");
  if (formEntrar) {
    const status = document.getElementById("auth-status");
    const btn = document.getElementById("btn-entrar");
    formEntrar.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(formEntrar);
      const email = String(fd.get("email") || "").trim().toLowerCase();
      const senha = String(fd.get("senha") || "");
      if (!email.includes("@") || !senha) {
        return setStatus(status, "Informe e-mail e senha.", "erro");
      }

      btn.disabled = true;
      setStatus(status, "Entrando…", "info");
      try {
        const sb = await esperarSupabase();
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        setStatus(status, "Login ok. Redirecionando…", "ok");
        location.href = destinoAposLogin();
      } catch (erro) {
        setStatus(status, erro.message || "E-mail ou senha incorretos.", "erro");
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* -------- Recuperar senha -------- */
  const formRecuperar = document.getElementById("form-recuperar");
  const formNova = document.getElementById("form-nova-senha");
  const passoPedir = document.getElementById("passo-pedir");
  const passoNova = document.getElementById("passo-nova-senha");

  async function detectarRecovery() {
    if (!formNova) return;
    try {
      const sb = await esperarSupabase();
      // hash type=recovery ou sessão após clique no e-mail
      const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
      const type = hash.get("type") || params.get("type");
      const { data } = await sb.auth.getSession();
      if (type === "recovery" || (data.session && location.pathname.includes("recuperar-senha"))) {
        if (passoPedir) passoPedir.hidden = true;
        if (passoNova) passoNova.hidden = false;
      }
      sb.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          if (passoPedir) passoPedir.hidden = true;
          if (passoNova) passoNova.hidden = false;
        }
      });
    } catch {
      /* ignore */
    }
  }
  detectarRecovery();

  if (formRecuperar) {
    const status = document.getElementById("auth-status");
    formRecuperar.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const email = String(new FormData(formRecuperar).get("email") || "")
        .trim()
        .toLowerCase();
      if (!email.includes("@")) return setStatus(status, "Informe um e-mail válido.", "erro");
      setStatus(status, "Enviando link…", "info");
      try {
        const sb = await esperarSupabase();
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/recuperar-senha/`
        });
        if (error) throw error;
        setStatus(status, "Link enviado. Confira sua caixa de entrada.", "ok");
      } catch (erro) {
        setStatus(status, erro.message || "Não foi possível enviar o link.", "erro");
      }
    });
  }

  if (formNova) {
    const status = document.getElementById("auth-status-nova");
    formNova.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(formNova);
      const senha = String(fd.get("senha") || "");
      const senha2 = String(fd.get("senha2") || "");
      if (senha.length < 6) return setStatus(status, "A senha precisa ter ao menos 6 caracteres.", "erro");
      if (senha !== senha2) return setStatus(status, "As senhas não coincidem.", "erro");
      setStatus(status, "Salvando…", "info");
      try {
        const sb = await esperarSupabase();
        const { error } = await sb.auth.updateUser({ password: senha });
        if (error) throw error;
        setStatus(status, "Senha atualizada. Redirecionando…", "ok");
        location.href = "/painel/";
      } catch (erro) {
        setStatus(status, erro.message || "Não foi possível salvar a senha.", "erro");
      }
    });
  }
})();
