/* =========================================================
   Códigos vitalícios de uso único (admin gera, cadastro reserva/resgata)
   ========================================================= */

const crypto = require("crypto");
const { getSupabase, supabaseConfigured } = require("./supabase");

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PREFIXO = "MYREP-";
const COMPRIMENTO = 6;

function normalizarCodigo(raw) {
  const c = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!c) return "";
  if (c.startsWith(PREFIXO)) return c;
  return `${PREFIXO}${c.replace(/^MYREP-?/, "")}`;
}

function normalizarEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  return e.includes("@") ? e.slice(0, 160) : "";
}

function gerarCodigoUnico() {
  const bytes = crypto.randomBytes(COMPRIMENTO);
  let sufixo = "";
  for (let i = 0; i < COMPRIMENTO; i += 1) {
    sufixo += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return `${PREFIXO}${sufixo}`;
}

function statusDe(row) {
  if (!row) return "desconhecido";
  if (row.usado_em) return "usado";
  if (row.reservado_email) return "reservado";
  return "disponivel";
}

function resumir(row) {
  if (!row) return null;
  return {
    id: row.id,
    codigo: row.codigo,
    status: statusDe(row),
    criado_em: row.criado_em,
    reservado_email: row.reservado_email || null,
    reservado_em: row.reservado_em || null,
    usado_em: row.usado_em || null,
    usado_por: row.usado_por || null
  };
}

async function listarCodigos({ limit = 100 } = {}) {
  if (!supabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("codigos_vitalicios")
    .select("id, codigo, criado_em, reservado_email, reservado_em, usado_em, usado_por")
    .order("criado_em", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listarCodigos:", error.message);
    return [];
  }
  return (data || []).map(resumir);
}

async function criarCodigo() {
  if (!supabaseConfigured()) {
    const erro = new Error("Supabase não configurado.");
    erro.status = 503;
    throw erro;
  }
  const sb = getSupabase();

  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const codigo = gerarCodigoUnico();
    const { data, error } = await sb
      .from("codigos_vitalicios")
      .insert({ codigo })
      .select("id, codigo, criado_em, reservado_email, reservado_em, usado_em, usado_por")
      .single();
    if (!error && data) return resumir(data);
    if (error?.code !== "23505") {
      console.error("criarCodigo:", error?.message);
      const erro = new Error("Falha ao gerar código.");
      erro.status = 500;
      throw erro;
    }
  }

  const erro = new Error("Não foi possível gerar um código único. Tente de novo.");
  erro.status = 500;
  throw erro;
}

async function obterPorCodigo(codigo) {
  if (!supabaseConfigured()) return null;
  const sb = getSupabase();
  const c = normalizarCodigo(codigo);
  const { data, error } = await sb
    .from("codigos_vitalicios")
    .select("id, codigo, criado_em, reservado_email, reservado_em, usado_em, usado_por")
    .eq("codigo", c)
    .maybeSingle();
  if (error) {
    console.error("obterPorCodigo:", error.message);
    return null;
  }
  return data;
}

async function reservarCodigo(codigo, email) {
  const c = normalizarCodigo(codigo);
  const e = normalizarEmail(email);
  if (!c || !c.startsWith(PREFIXO)) {
    const erro = new Error("Código inválido.");
    erro.status = 400;
    throw erro;
  }
  if (!e) {
    const erro = new Error("Informe um e-mail válido.");
    erro.status = 400;
    throw erro;
  }
  if (!supabaseConfigured()) {
    const erro = new Error("Supabase não configurado.");
    erro.status = 503;
    throw erro;
  }

  const sb = getSupabase();
  const existente = await obterPorCodigo(c);
  if (!existente) {
    const erro = new Error("Código não encontrado.");
    erro.status = 404;
    throw erro;
  }
  if (existente.usado_em) {
    const erro = new Error("Este código já foi utilizado.");
    erro.status = 409;
    throw erro;
  }
  if (existente.reservado_email && existente.reservado_email !== e) {
    const erro = new Error("Este código já está reservado para outro e-mail.");
    erro.status = 409;
    throw erro;
  }
  if (existente.reservado_email === e) {
    return resumir(existente);
  }

  const agora = new Date().toISOString();
  const { data, error } = await sb
    .from("codigos_vitalicios")
    .update({ reservado_email: e, reservado_em: agora })
    .eq("id", existente.id)
    .is("usado_em", null)
    .is("reservado_email", null)
    .select("id, codigo, criado_em, reservado_email, reservado_em, usado_em, usado_por")
    .maybeSingle();

  if (error || !data) {
    const atual = await obterPorCodigo(c);
    if (atual?.usado_em) {
      const erro = new Error("Este código já foi utilizado.");
      erro.status = 409;
      throw erro;
    }
    if (atual?.reservado_email && atual.reservado_email !== e) {
      const erro = new Error("Este código já está reservado para outro e-mail.");
      erro.status = 409;
      throw erro;
    }
    const erro = new Error("Não foi possível reservar o código.");
    erro.status = 409;
    throw erro;
  }

  return resumir(data);
}

async function resgatarCodigoReservado(userId, email) {
  const e = normalizarEmail(email);
  if (!userId || !e || !supabaseConfigured()) return null;

  const sb = getSupabase();
  const { data: reservado, error: findErr } = await sb
    .from("codigos_vitalicios")
    .select("id, codigo, criado_em, reservado_email, reservado_em, usado_em, usado_por")
    .eq("reservado_email", e)
    .is("usado_em", null)
    .order("reservado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.error("resgatarCodigoReservado find:", findErr.message);
    return null;
  }
  if (!reservado) return null;

  const agora = new Date().toISOString();
  const { data, error } = await sb
    .from("codigos_vitalicios")
    .update({ usado_em: agora, usado_por: userId })
    .eq("id", reservado.id)
    .is("usado_em", null)
    .eq("reservado_email", e)
    .select("id, codigo, criado_em, reservado_email, reservado_em, usado_em, usado_por")
    .maybeSingle();

  if (error || !data) {
    console.error("resgatarCodigoReservado update:", error?.message);
    return null;
  }

  return resumir(data);
}

async function revogarCodigo(id) {
  if (!id || !supabaseConfigured()) {
    const erro = new Error("Código inválido.");
    erro.status = 400;
    throw erro;
  }
  const sb = getSupabase();
  const { data: row, error: findErr } = await sb
    .from("codigos_vitalicios")
    .select("id, usado_em")
    .eq("id", id)
    .maybeSingle();

  if (findErr || !row) {
    const erro = new Error("Código não encontrado.");
    erro.status = 404;
    throw erro;
  }
  if (row.usado_em) {
    const erro = new Error("Códigos já utilizados não podem ser revogados.");
    erro.status = 409;
    throw erro;
  }

  const { error } = await sb.from("codigos_vitalicios").delete().eq("id", id);
  if (error) {
    console.error("revogarCodigo:", error.message);
    const erro = new Error("Falha ao revogar código.");
    erro.status = 500;
    throw erro;
  }
  return true;
}

module.exports = {
  normalizarCodigo,
  normalizarEmail,
  gerarCodigoUnico,
  statusDe,
  listarCodigos,
  criarCodigo,
  obterPorCodigo,
  reservarCodigo,
  resgatarCodigoReservado,
  revogarCodigo
};
