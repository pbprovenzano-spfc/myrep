# Supabase — My Rep

1. Abra o projeto [Supabase](https://supabase.com/dashboard) (`raodkkzzxyhxucscuoct`).
2. **SQL Editor** → cole e execute [`schema.sql`](schema.sql) (inclui `mensagens`,
   `mensagens_anexos`, o bucket privado `inbox`, e em `representantes` as colunas
   `email_cobranca`, `ativo`, `inadimplente_desde` e `controle_manual` para o painel
   de páginas). Se a tabela `representantes` já existia, os
   `alter table … add column if not exists` do schema atualizam o banco sem apagar dados.
3. **Settings → API**: copie `URL`, `anon key` e `service_role key` para `.env` e Vercel.
4. Na raiz do projeto: `npm run seed:supabase` (sobe JSONs + assets).
