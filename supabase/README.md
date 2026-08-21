# Supabase — My Rep

1. Abra o projeto [Supabase](https://supabase.com/dashboard/project/raodkkzzxyhxucscuoct).
2. **SQL Editor** → cole e execute [`schema.sql`](schema.sql). Projetos já existentes: execute também [`migration-self-service.sql`](migration-self-service.sql) e [`migration-codigos-vitalicios.sql`](migration-codigos-vitalicios.sql) (ou `npm run migrate:codigos-vitalicios`).
3. **Authentication → Providers**: habilite **Email** (email + senha).
4. **Authentication → URL Configuration** ([link direto](https://supabase.com/dashboard/project/raodkkzzxyhxucscuoct/auth/url-configuration)):

   **Site URL** (obrigatório em produção — se ficar em `http://localhost:3000`, os e-mails de confirmação abrem no seu PC):

   ```
   https://myrep.com.br
   ```

   **Redirect URLs** (uma URL por linha; a barra final deve bater com o código em `publico/js/auth-pages.js`):

   ```
   https://myrep.com.br/painel/
   https://www.myrep.com.br/painel/
   https://myrep.com.br/recuperar-senha/
   https://www.myrep.com.br/recuperar-senha/
   http://localhost:3000/painel/
   http://localhost:3000/recuperar-senha/
   ```

   Depois de salvar, peça um **novo** e-mail de confirmação (Authentication → Users → usuário → Resend confirmation). Links antigos continuam com o domínio errado.

   **Automático (Management API):** com `SUPABASE_ACCESS_TOKEN` no `.env`, rode `npm run configure:auth-urls`.

5. **Settings → API**: copie `URL`, `anon key` e `service_role key` para `.env` e Vercel.
   - `SUPABASE_ANON_KEY` é injetada no HTML pelo `build.js` (browser).
   - `SUPABASE_SERVICE_ROLE_KEY` fica só no servidor.
6. Migração dos representantes demo: `npm run seed:supabase` (sobe JSONs de `clientes/` + assets para Storage).

## Fluxo self-service

`/cadastro/` → confirma e-mail → assina no `/painel/` (Asaas) → escolhe URL definitiva → edita a página no painel → publica → compartilha `/{slug}/`.

Páginas são renderizadas em tempo real via `/api/pagina` (não dependem mais de deploy para atualizar conteúdo).

Pedidos de **suporte** vão para a inbox do `/admin/` (filtro tipo Suporte), com resposta gravada em `mensagens_respostas`.

## E-mail de confirmação (Resend SMTP — opcional)

Para os e-mails de cadastro e recuperação de senha saírem de `ola@myrep.com.br` em vez do remetente padrão do Supabase:

**Authentication → SMTP** → habilitar custom SMTP:

| Campo | Valor |
|-------|--------|
| Host | `smtp.resend.com` |
| Port | `465` |
| User | `resend` |
| Password | sua `RESEND_API_KEY` |
| Sender email | `ola@myrep.com.br` |
| Sender name | `My Rep` |

O fluxo de auth continua no Supabase; só muda quem entrega o e-mail.
