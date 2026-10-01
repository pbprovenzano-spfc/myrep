/* =========================================================
   Consulta de CEP (ViaCEP) — rua, bairro, cidade e UF
   ========================================================= */

(function (global) {
  function digitos(valor) {
    return String(valor || "").replace(/\D/g, "");
  }

  async function buscarCep(cep) {
    const d = digitos(cep);
    if (d.length !== 8) return null;
    const resp = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    if (!data || data.erro) return null;
    return {
      endereco: data.logradouro || "",
      bairro: data.bairro || "",
      cidade: data.localidade || "",
      uf: data.uf || ""
    };
  }

  function ligarCep(inputCep, campos) {
    if (!inputCep) return;
    let timer = null;
    inputCep.addEventListener("input", () => {
      clearTimeout(timer);
      if (digitos(inputCep.value).length !== 8) return;
      timer = setTimeout(async () => {
        try {
          const end = await buscarCep(inputCep.value);
          if (!end) return;
          if (campos.endereco && end.endereco) campos.endereco.value = end.endereco;
          if (campos.bairro && end.bairro) campos.bairro.value = end.bairro;
          if (campos.cidade && end.cidade) campos.cidade.value = end.cidade;
          if (campos.uf && end.uf) campos.uf.value = end.uf;
        } catch {
          /* a pessoa digita o endereço se a consulta falhar */
        }
      }, 300);
    });
  }

  global.MyRepCep = { buscarCep, ligarCep };
})(typeof window !== "undefined" ? window : globalThis);
