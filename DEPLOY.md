# Deploy — My Rep

## Supabase

1. Execute [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor.
2. Copie `.env.example` → `.env` e preencha `SUPABASE_*`.
3. `npm run seed:supabase`

## GitHub

```powershell
git init
git add .
git commit -m "Initial commit: My Rep site + Supabase"
gh repo create myrep --private --source=. --remote=origin --push
```

## Vercel

1. Importe o repo `myrep` em [vercel.com/new](https://vercel.com/new).
2. Build: `npm run build` · Output: `dist` (já em `vercel.json`).
3. Environment variables (Production):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
4. Domínios: `myrep.com.br` e `www.myrep.com.br` → configure DNS no registrador conforme a Vercel.

Depois: Resend, Asaas, `PAGAMENTO_TOKEN_SECRET`, `ADMIN_PASSWORD`.
