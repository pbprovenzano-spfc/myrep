/* =========================================================
   alteracoes.js — fluxo em 2 passos (e-mail → pedido)
   ========================================================= */

(function () {
  const passoEmail = document.getElementById("passo-email");
  const passoPedido = document.getElementById("passo-pedido");
  const formEmail = document.getElementById("form-email");
  const formPedido = document.getElementById("form-pedido");
  const statusEmail = document.getElementById("status-email");
  const statusPedido = document.getElementById("status-pedido");
  const emailExibido = document.getElementById("email-exibido");
  const btnTrocar = document.getElementById("trocar-email");
  const btnEnviar = document.getElementById("enviar-pedido");

  if (!formEmail || !formPedido) return;

  let emailCadastro = "";

  function setStatus(el, msg, tipo) {
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.tipo = tipo || "";
  }

  function mostrarPasso(passo) {
    if (passo === "email") {
      passoEmail.hidden = false;
      passoPedido.hidden = true;
    } else {
      passoEmail.hidden = true;
      passoPedido.hidden = false;
    }
  }

  formEmail.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const email = String(new FormData(formEmail).get("email") || "")
      .trim()
      .toLowerCase();
    if (!email.includes("@")) {
      return setStatus(statusEmail, "Informe um e-mail válido.", "erro");
    }
    emailCadastro = email;
    emailExibido.textContent = email;
    setStatus(statusEmail, "", "");
    setStatus(statusPedido, "", "");
    mostrarPasso("pedido");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  btnTrocar?.addEventListener("click", () => {
    mostrarPasso("email");
    formEmail.querySelector('input[name="email"]')?.focus();
  });

  function temPedido(fd) {
    const texto = (nome) => String(fd.get(nome) || "").trim();
    const arquivo = (nome) => {
      const f = fd.get(nome);
      return f instanceof File && f.size > 0;
    };

    return (
      texto("catalogo_add_nome") ||
      arquivo("catalogo_add_arquivo") ||
      texto("catalogo_troca_nome") ||
      arquivo("catalogo_troca_arquivo") ||
      texto("catalogo_remover") ||
      texto("logo_add_nome") ||
      arquivo("logo_add_arquivo") ||
      texto("logo_remover") ||
      texto("mensagem").length >= 3 ||
      texto("telefone")
    );
  }

  formPedido.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!emailCadastro.includes("@")) {
      mostrarPasso("email");
      return setStatus(statusEmail, "Informe o e-mail do cadastro primeiro.", "erro");
    }

    const fd = new FormData(formPedido);
    if (!temPedido(fd)) {
      return setStatus(
        statusPedido,
        "Preencha uma alteração, descreva o pedido ou deixe um telefone para retorno.",
        "erro"
      );
    }

    const corpo = new FormData();
    corpo.append("email", emailCadastro);
    for (const [chave, valor] of fd.entries()) {
      if (valor instanceof File) {
        if (valor.size > 0) corpo.append(chave, valor, valor.name);
      } else if (String(valor).trim()) {
        corpo.append(chave, String(valor).trim());
      }
    }

    btnEnviar.disabled = true;
    setStatus(statusPedido, "Enviando solicitação…", "info");

    try {
      const resp = await fetch("/api/alteracoes", {
        method: "POST",
        body: corpo
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.erro || `Falha (${resp.status})`);

      formPedido.reset();
      setStatus(
        statusPedido,
        "Solicitação enviada. Em breve fazemos as alterações na sua página.",
        "ok"
      );
    } catch (erro) {
      setStatus(statusPedido, erro.message || "Não foi possível enviar. Tente de novo.", "erro");
    } finally {
      btnEnviar.disabled = false;
    }
  });
})();
