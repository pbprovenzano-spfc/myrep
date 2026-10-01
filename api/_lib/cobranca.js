/* =========================================================
   Dados de cobrança — o que a Asaas precisa para cobrar
   ========================================================= */

const { documentoValido, digitosDocumento } = require("./pagamento");

function soDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function texto(valor, max) {
  return String(valor || "")
    .trim()
    .slice(0, max);
}

function lerCobranca(fonte) {
  const f = fonte && typeof fonte === "object" ? fonte : {};
  let celular = soDigitos(f.celular);
  if (celular.startsWith("55") && celular.length > 11) celular = celular.slice(2);
  return {
    nome: texto(f.nome, 80),
    cpfCnpj: digitosDocumento(f.cpfCnpj || f.cpf_cnpj || f.documento),
    celular: celular.slice(0, 11),
    cep: soDigitos(f.cep).slice(0, 8),
    endereco: texto(f.endereco, 255),
    numero: texto(f.numero, 20),
    complemento: texto(f.complemento, 255),
    bairro: texto(f.bairro, 80),
    cidade: texto(f.cidade, 80),
    uf: texto(f.uf, 2).toUpperCase()
  };
}

function cobrancaDeUsuario(user) {
  const m = user?.user_metadata || {};
  return lerCobranca({
    nome: m.nome || m.full_name,
    cpf_cnpj: m.cpf_cnpj,
    celular: m.celular,
    cep: m.cep,
    endereco: m.endereco,
    numero: m.numero,
    complemento: m.complemento,
    bairro: m.bairro,
    cidade: m.cidade,
    uf: m.uf
  });
}

function mesclarCobranca(salva, entrada) {
  const base = lerCobranca(salva);
  const novo = lerCobranca(entrada);
  const out = { ...base };
  for (const chave of Object.keys(novo)) {
    if (novo[chave]) out[chave] = novo[chave];
  }
  return out;
}

function validarCobranca(cobranca) {
  const c = lerCobranca(cobranca);
  if (c.nome.length < 3) return "Informe o nome completo ou a razão social.";
  if (!documentoValido(c.cpfCnpj)) return "Informe um CPF ou CNPJ válido.";
  if (c.celular.length < 10 || c.celular.length > 11) return "Informe o celular com DDD.";
  if (c.cep.length !== 8) return "Informe um CEP válido.";
  if (!c.endereco) return "Informe a rua.";
  if (!c.numero) return "Informe o número do endereço.";
  if (!c.bairro) return "Informe o bairro.";
  return "";
}

function cobrancaCompleta(cobranca) {
  return !validarCobranca(cobranca);
}

function metadataDeCobranca(cobranca) {
  const c = lerCobranca(cobranca);
  return {
    nome: c.nome,
    cpf_cnpj: c.cpfCnpj,
    celular: c.celular,
    cep: c.cep,
    endereco: c.endereco,
    numero: c.numero,
    complemento: c.complemento,
    bairro: c.bairro,
    cidade: c.cidade,
    uf: c.uf
  };
}

function clienteAsaasDeCobranca(cobranca, { email, userId }) {
  const c = lerCobranca(cobranca);
  const corpo = {
    name: c.nome,
    cpfCnpj: c.cpfCnpj,
    email,
    mobilePhone: c.celular,
    postalCode: c.cep,
    address: c.endereco,
    addressNumber: c.numero,
    province: c.bairro,
    externalReference: userId
  };
  if (c.complemento) corpo.complement = c.complemento;
  return corpo;
}

function respostaCobranca(cobranca) {
  const c = lerCobranca(cobranca);
  return { ...c, completo: cobrancaCompleta(c) };
}

module.exports = {
  lerCobranca,
  cobrancaDeUsuario,
  mesclarCobranca,
  validarCobranca,
  cobrancaCompleta,
  metadataDeCobranca,
  clienteAsaasDeCobranca,
  respostaCobranca
};
