# Supabase — My Rep

1. Abra o projeto [Supabase](https://supabase.com/dashboard).
2. **SQL Editor** → cole e execute [`schema.sql`](schema.sql). Inclui:
   - `representantes` com `email_cobranca`, `ativo`, `inadimplente_desde`, `controle_manual`, `user_id`
   - tabela `assinaturas` (espelho local da assinatura Asaas por usuário)
   - `mensagens` / `mensagens_anexos` + bucket privado `inbox`
   - políticas RLS para o dono autenticado ler/atualizar a própria página e inserir mensagens
3. **Authentication → Providers**: habilite **Email** (email + senha).
4. **Authentication → URL Configuration**:
   - Site URL: `https://seu-dominio`
   - Redirect URLs: `https://seu-dominio/painel/`, `https://seu-dominio/recuperar-senha/`, `http://localhost:3000/painel/`, `http://localhost:3000/recuperar-senha/`
5. **Settings → API**: copie `URL`, `anon key` e `service_role key` para `.env` e Vercel.
   - `SUPABASE_ANON_KEY` é injetada no HTML pelo `build.js` (browser).
   - `SUPABASE_SERVICE_ROLE_KEY` fica só no servidor.
6. Na raiz do projeto: `npm run seed:supabase` (sobe JSONs + assets).

## Contas de cliente

Fluxo: `/cadastro/` → confirma e-mail → `/painel/` → escolhe plano (Asaas) → webhook atualiza `assinaturas` e vincula `user_id` em `representantes` → briefing / alterações na inbox do `/admin/`.

Páginas antigas sem `user_id` continuam no ar. No admin, use **Usuários → Vincular página** (e-mail + slug) para associar contas novas.
