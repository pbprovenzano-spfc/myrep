# Supabase — My Rep

1. Abra o projeto [Supabase](https://supabase.com/dashboard).
2. **SQL Editor** → cole e execute [`schema.sql`](schema.sql). Projetos já existentes: execute também [`migration-self-service.sql`](migration-self-service.sql).
3. **Authentication → Providers**: habilite **Email** (email + senha).
4. **Authentication → URL Configuration**:
   - Site URL: `https://seu-dominio`
   - Redirect URLs: `https://seu-dominio/painel/`, `https://seu-dominio/recuperar-senha/`, `http://localhost:3000/painel/`, `http://localhost:3000/recuperar-senha/`
5. **Settings → API**: copie `URL`, `anon key` e `service_role key` para `.env` e Vercel.
   - `SUPABASE_ANON_KEY` é injetada no HTML pelo `build.js` (browser).
   - `SUPABASE_SERVICE_ROLE_KEY` fica só no servidor.
6. Migração dos representantes demo: `npm run seed:supabase` (sobe JSONs de `clientes/` + assets para Storage).

## Fluxo self-service

`/cadastro/` → confirma e-mail → assina no `/painel/` (Asaas) → escolhe URL definitiva → edita a página no painel → publica → compartilha `/{slug}/`.

Páginas são renderizadas em tempo real via `/api/pagina` (não dependem mais de deploy para atualizar conteúdo).

Pedidos de **suporte** vão para a inbox do `/admin/` (filtro tipo Suporte), com resposta gravada em `mensagens_respostas`.
