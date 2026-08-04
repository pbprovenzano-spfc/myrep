# Ativar myrep.com.br (Registro.br)

O domínio **já está** no projeto Vercel `myrep`. Para ficar **ativo**, configure a zona DNS onde o domínio está hoje (servidores `a.auto.dns.br` / `b.auto.dns.br` → painel **Registro.br**).

## Passo a passo

1. Acesse [registro.br](https://registro.br) → **Meus domínios** → **myrep.com.br**
2. **DNS** → **Editar zona** (ou “Modo avançado”)
3. Remova entradas conflitantes para `@` e `www` (se existirem)
4. Adicione:

| Tipo  | Nome | Destino / Valor                         |
|-------|------|-----------------------------------------|
| **A** | `@`  | `216.198.79.1`                          |
| **A** | `@`  | `64.29.17.1`                            |
| **CNAME** | `www` | `cad408fa49781789.vercel-dns-017.com` |

(Alternativa para `www`: CNAME → `cname.vercel-dns.com` se a Vercel aceitar no painel.)

5. Salve e aguarde propagação (minutos a algumas horas)
6. Verifique:

```powershell
npx vercel domains verify myrep.com.br
npx vercel domains verify www.myrep.com.br
```

Quando `ok: true`, o site responde em **https://myrep.com.br** e **https://www.myrep.com.br**.

## Opção B — nameservers Vercel

No Registro.br, troque os servidores DNS para:

- `ns1.vercel-dns.com`
- `ns2.vercel-dns.com`

A Vercel passa a gerenciar os registros (menos comum se você já usa a zona no Registro.br).

## Status atual (Vercel)

- Projeto: `myrep`
- Domínios anexados: `myrep.com.br`, `www.myrep.com.br`
- Configuração DNS: **inválida** até os registros acima existirem
