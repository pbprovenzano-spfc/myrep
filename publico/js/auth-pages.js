/* =========================================================
   auth-pages.js — cadastro / entrar / recuperar senha
   ========================================================= */

(function () {
  const params = new URLSearchParams(location.search);
  const plano = params.get("plano") || "";
  const next = params.get("next") || "";

  const MSG_LINK_EXPIRADO =
    "Este link expirou ou já foi usado. Entre na conta ou peça um novo e-mail.";
  const TERMOS_VERSAO = "2026-08-31";

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

  if (params.get("erro") === "link_expirado" || params.get("erro") === "sessao") {
    const statusAuth = document.getElementById("auth-status");
    if (statusAuth && (document.getElementById("form-cadastro") || document.getElementById("form-entrar"))) {
      setStatus(
        statusAuth,
        params.get("erro") === "sessao"
          ? "Sua sessão expirou. Entre de novo."
          : MSG_LINK_EXPIRADO,
        "erro"
      );
    }
  }

  /* -------- Cadastro -------- */
  const formCadastro = document.getElementById("form-cadastro");
  if (formCadastro) {
    const status = document.getElementById("auth-status");
    const btn = document.getElementById("btn-cadastro");
    window.MyRepCep?.ligarCep(document.getElementById("cadastro-cep"), {
      endereco: document.getElementById("cadastro-endereco"),
      bairro: document.getElementById("cadastro-bairro"),
      cidade: document.getElementById("cadastro-cidade"),
      uf: document.getElementById("cadastro-uf")
    });
    formCadastro.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(formCadastro);
      const email = String(fd.get("email") || "").trim().toLowerCase();
      const senha = String(fd.get("senha") || "");
      const senha2 = String(fd.get("senha2") || "");
      const nome = String(fd.get("nome") || "").trim();
      const documento = String(fd.get("documento") || "");
      const celular = String(fd.get("celular") || "");
      const cep = String(fd.get("cep") || "");
      const endereco = String(fd.get("endereco") || "").trim();
      const numero = String(fd.get("numero") || "").trim();
      const complemento = String(fd.get("complemento") || "").trim();
      const bairro = String(fd.get("bairro") || "").trim();
      const cidade = String(fd.get("cidade") || "").trim();
      const uf = String(fd.get("uf") || "").trim();
      const codigoVitalicio = String(fd.get("codigo_vitalicio") || "").trim();
      const aceiteTermos = fd.get("aceite_termos") === "on";
      const docDigitos = documento.replace(/\D/g, "");
      const celDigitos = celular.replace(/\D/g, "").replace(/^55(?=\d{10,})/, "");
      const cepDigitos = cep.replace(/\D/g, "");

      if (nome.length < 3) return setStatus(status, "Informe o nome completo ou a razão social.", "erro");
      if (docDigitos.length !== 11 && docDigitos.length !== 14) {
        return setStatus(status, "Informe um CPF ou CNPJ válido.", "erro");
      }
      if (celDigitos.length < 10 || celDigitos.length > 11) {
        return setStatus(status, "Informe o celular com DDD.", "erro");
      }
      if (cepDigitos.length !== 8) return setStatus(status, "Informe um CEP válido.", "erro");
      if (!endereco) return setStatus(status, "Informe a rua.", "erro");
      if (!numero) return setStatus(status, "Informe o número do endereço.", "erro");
      if (!bairro) return setStatus(status, "Informe o bairro.", "erro");
      if (!email.includes("@")) return setStatus(status, "Informe um e-mail válido.", "erro");
      if (senha.length < 6) return setStatus(status, "A senha precisa ter ao menos 6 caracteres.", "erro");
      if (senha !== senha2) return setStatus(status, "As senhas não coincidem.", "erro");
      if (!aceiteTermos) {
        return setStatus(status, "Você precisa aceitar os Termos de uso e a Política de privacidade.", "erro");
      }

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
        const metadata = {
          termos_aceitos_em: new Date().toISOString(),
          termos_versao: TERMOS_VERSAO,
          nome,
          cpf_cnpj: docDigitos,
          celular: celDigitos,
          cep: cepDigitos,
          endereco,
          numero,
          complemento,
          bairro,
          cidade,
          uf: uf.toUpperCase()
        };

        const { data, error } = await sb.auth.signUp({
          email,
          password: senha,
          options: {
            data: metadata,
            emailRedirectTo: `${location.origin}/painel/`
          }
        });
        if (error) throw error;

        if (data.session) {
          setStatus(status, "Conta criada. Redirecionando…", "ok");
          location.href = destinoAposLogin();
          return;
        }

        location.replace(`/cadastro/confirme/?email=${encodeURIComponent(email)}`);
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
