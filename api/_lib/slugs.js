/* =========================================================
   Slugs reservados — rotas do site que não podem ser URLs de rep
   ========================================================= */

const RESERVADOS = new Set([
  "api",
  "css",
  "js",
  "img",
  "geo",
  "admin",
  "briefing",
  "pagamento",
  "alteracoes",
  "termos",
  "representantes",
  "assinantes",
  "cadastro",
  "entrar",
  "recuperar-senha",
  "painel",
  "assets-clientes",
  "inbox",
  "favicon.ico",
  "404.html",
  "index.html",
  "www",
  "app",
  "mail",
  "email",
  "suporte",
  "help",
  "blog",
  "status"
]);

function normalizarSlug(slug) {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function slugValido(slug) {
  const s = normalizarSlug(slug);
  if (!s || s.length < 3) return { ok: false, slug: s, motivo: "Use pelo menos 3 caracteres." };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s) && s.length >= 3) {
    if (!/^[a-z0-9-]+$/.test(s)) {
      return { ok: false, slug: s, motivo: "Use só letras minúsculas, números e hífen." };
    }
  }
  if (RESERVADOS.has(s)) {
    return { ok: false, slug: s, motivo: "Este endereço está reservado." };
  }
  return { ok: true, slug: s, motivo: null };
}

module.exports = { RESERVADOS, normalizarSlug, slugValido };
