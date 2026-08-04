# Deploy — My Rep

## Supabase

1. Execute [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor.
2. Copie `.env.example` → `.env` e preencha `SUPABASE_*`.
3. `npm run seed:supabase`

## Vercel (já criado)

- **Produção:** https://myrep-mu-brown.vercel.app
- **Projeto:** `pfbprovenzano-3527s-projects/myrep`

### Domínio myrep.com.br

No registrador (DNS atual: `a.auto.dns.br` / `b.auto.dns.br`), escolha **uma** opção:

**Opção A (recomendada):** registro `A` → `myrep.com.br` → `76.76.21.21` e `CNAME` `www` → `cname.vercel-dns.com`

**Opção B:** trocar nameservers para `ns1.vercel-dns.com` e `ns2.vercel-dns.com`

Verifique: `npx vercel domains inspect myrep.com.br`

### Variáveis na Vercel

Settings → Environment Variables → Production:

- `SUPABASE_URL=https://raodkkzzxyhxucscuoct.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` (painel Supabase)

Redeploy após salvar. Com Supabase configurado, o build usa o banco + Storage; sem keys, usa os JSONs do repo.

## GitHub

Repositório local pronto (`git init`, branch `main`, 3 commits). Falta autenticar no GitHub:

```powershell
gh auth login
# ou abra https://github.com/login/device com o código que o gh mostrar
.\scripts\publish-github.ps1
```

Repo: https://github.com/pbprovenzano-spfc/myrep

Depois, na Vercel: **Settings → Git** → conectar o repo `myrep` para deploy automático.

## Vercel

1. Importe o repo `myrep` em [vercel.com/new](https://vercel.com/new).
2. Build: `npm run build` · Output: `dist` (já em `vercel.json`).
3. Environment variables (Production):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
4. Domínios: `myrep.com.br` e `www.myrep.com.br` → configure DNS no registrador conforme a Vercel.

Depois: Resend, Asaas, `PAGAMENTO_TOKEN_SECRET`, `ADMIN_PASSWORD`.
