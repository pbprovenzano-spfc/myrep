# My Rep

Páginas únicas para representantes comerciais. Cada perfil tem uma rota por path:
`/kp-representacao`, `/silva-protecao`, e assim por diante.

A home (`/`) é a landing do produto. A lista interna de perfis fica em
`/representantes` (sem link público por enquanto).

Gerador estático: um script Node lê os JSONs e gera `/dist`. Clientes criam
conta (Supabase Auth), assinam na Asaas e usam o **painel** (`/painel/`) para
montar a página, gerenciar catálogos/logos e compartilhar o cartão. A operação
fica no `/admin/` (usuários, adimplência, inbox).

## Rodar

```bash
npm install
npm run geo          # baixa malhas do IBGE → /geo (quando muda UF/cidade)
npm run dev          # http://localhost:3000 + rebuild ao salvar
npm run build        # gera /dist
```

Node 18+. Com o `dev` rodando, mudanças em `clientes/`, `template/`, `publico/`,
`assets-clientes/` ou `api/` reconstrói o site.

## Estrutura

```
clientes/              um JSON por representante
template/
  pagina.html          página do representante
  home.html            landing
  cadastro.html        criar conta (email+senha)
  entrar.html          login
  recuperar-senha.html
  painel.html          área do cliente
  admin.html           painel /admin/
publico/
  css/style.css
  js/painel.js         painel do cliente
  js/admin.js          painel admin
api/
  auth/perfil.js       sessão do cliente
  painel/*             checkout, alterações, página, suporte
  asaas/webhook.js     adimplência + assinaturas
  admin.js             KPIs, inbox, usuários, páginas
  _lib/auth.js         Supabase Auth (Bearer)
  _lib/assinaturas.js  espelho local da assinatura
  _lib/inbox.js
assets-clientes/<slug>/
supabase/schema.sql
build.js
dev.js
vercel.json
.env.example
```

## Fluxo do cliente

1. `/cadastro/` — cria conta Supabase (email + senha)
2. Escolhe plano → Asaas (checkout no painel)
3. Webhook confirma pagamento → `assinaturas` + adimplência
4. `/painel/` — edita a página, catálogos/logos, suporte e **Compartilhar Cartão**
5. A página publica em `/{slug}/` após configuração no painel

## Painel do cliente (`/painel/`)

Requer login. Seções: assinatura, sua página (com botão compartilhar),
catálogos/logos, escolha de URL e suporte.

## Painel admin (`/admin/`)

Login com `ADMIN_PASSWORD`. Abas:

- **Visão geral** — MRR, assinaturas ativas, recebido no mês, ticket médio, vencidos; KPIs de páginas
- **Caixa de entrada** — alterações e suporte (vinculados a `user_id` quando houver)
- **Usuários** — contas Auth, assinatura local, página vinculada; vincular slug ↔ e-mail
- **Páginas** — dono, e-mail de cobrança, adimplência, Automático/Manual
- **Assinantes** — assinaturas e pagamentos Asaas

### Ativação e inadimplência

- Cada página tem `email_cobranca`, `ativo`, `inadimplente_desde` e `controle_manual` (Supabase `representantes` ou `data/paginas.json`).
- Webhook Asaas (`PAYMENT_OVERDUE`) marca inadimplência; após **3 dias** de carência a página desativa sozinha (`ativo: false` → 404 no middleware).
- Pagamento confirmado reativa automaticamente — **exceto** se a página estiver em **controle manual**.
- No admin, Ativar/Desativar entra em controle manual (a automação não altera `ativo` até **Voltar ao automático**).
- “Atualizar adimplência” sincroniza com a Asaas respeitando o modo manual.

Rode o [`supabase/schema.sql`](supabase/schema.sql) atualizado (inclui `user_id`,
tabela `assinaturas` e RLS). Veja também [`supabase/README.md`](supabase/README.md)
para Auth (email/senha) e redirect URLs.

`/assinantes/` redireciona para `/admin/`. `/alteracoes/` e `/briefing/` redirecionam para `/painel/`.
Em produção a inbox usa `mensagens` / `mensagens_anexos` e o bucket privado `inbox` do Supabase.

### Configurar Resend + Vercel

1. Crie conta em [resend.com](https://resend.com), gere uma API key e (em produção) verifique seu domínio.
2. Copie `.env.example` → `.env` e preencha:

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RESEND_API_KEY=re_xxxxxxxx
BRIEFING_TO_EMAIL=myrep.sup@gmail.com
BRIEFING_FROM_EMAIL=My Rep <ola@myrep.com.br>
SUPPORT_EMAIL=myrep.sup@gmail.com
ADMIN_PASSWORD=...
ASAAS_API_KEY=...
ASAAS_LINK_MENSAL=...
```

3. Na Vercel: importe o repo, use build `npm run build` e output `dist` (já em `vercel.json`).
4. Em **Settings → Environment Variables**, cadastre as variáveis (inclua as do Supabase e `ADMIN_PASSWORD`).
5. Deploy. Conta: `/cadastro/`; painel do cliente: `/painel/`; admin: `/admin/`.

Em `npm run dev` sem Supabase, a inbox grava em `/inbox/<id>/`. Auth de cliente
exige Supabase configurado.

## Cadastrar um representante novo

1. Crie `clientes/nome-do-cliente.json`
2. Crie `assets-clientes/nome-do-cliente/` com foto, logos e PDFs
3. Rode `npm run geo` quando incluir UFs novas (baixa malhas municipais usadas nos JSONs)
4. Salve — o site reconstrói sozinho

## Campos do JSON

| Campo | Obrigatório | Observação |
|---|---|---|
| `slug` | sim | só minúsculas, números e hífen. Vira a URL |
| `nome` | sim | |
| `whatsapp` | sim | `55` + DDD + número, só dígitos |
| `destaque` | não | `"pessoa"` (padrão) ou `"empresa"` — quem vira o título principal |
| `paleta` | não | `ambar` (padrão), `oceano`, `floresta`, `rubi` ou `ardosia` |
| `empresa` | não | representada; em evidência se `destaque` for `"empresa"` |
| `cargo` | não | vira a descrição da página |
| `foto` | não | nome do arquivo dentro de `assets-clientes/<slug>/` |
| `fotoTipo` | não | `"pessoa"` (padrão) ou `"logo"` — muda o encaixe da foto circular |
| `mensagemWhatsapp` | não | texto já preenchido na conversa |
| `marcas` | não | `[{ "nome": "3M", "logo": "marca-1.svg" }]` — sem `logo`, mostra o nome |
| `estados` | não | `["BA", "SE"]` — 2+ estados = mapa do Brasil com drill-down; 1 estado = mapa municipal direto |
| `cidades` | não | **1 estado:** `["Salvador", …]`. **Multi:** `{ "BA": ["Salvador"], "SE": ["Aracaju"] }`. Sem lista / lista vazia pinta o estado inteiro |
| `segmentos` | não | texto curto abaixo do mapa |
| `bio` | não | aparece no cabeçalho da página |
| `catalogos` | não | `[{ "titulo": "...", "arquivo": "x.pdf", "tipo": "PDF", "logo": "marca-1.svg" }]` |
| `contatos` | não | `[{ "canal": "E-mail", "valor": "...", "link": "mailto:..." }]` |

**Todo bloco só aparece se tiver conteúdo.** Lista vazia (`[]`) ou texto vazio
(`""`) faz o bloco sumir da página.

### Mapa de atuação

- **2 ou mais estados:** mapa do Brasil; clique numa UF ativa para abrir o mapa municipal com as cidades daquele estado (botão “← Estados” volta).
- **1 estado:** mapa municipal direto, sem drill-down.
- Sem cidades para uma UF: o estado inteiro fica pintado.
- Cidades são casadas com o IBGE ignorando acento e caixa. Nome inválido gera aviso no terminal sem derrubar o build.
- Sem JS: permanece a vista Brasil (multi) ou o mapa do estado (1 UF).
- Os arquivos em `/geo` precisam existir — rode `npm run geo` quando houver UFs novas (exige internet).

## Validação

O build recusa clientes com problema e avisa no terminal qual arquivo é, sem
derrubar o resto:

```
✕ joao.json: falta slug, nome — cliente ignorado
✕ maria.json: slug "Maria Rep" deve ter só letras minúsculas, números e hífen
✕ lima-agro.json: cidade "X" não encontrada em BA
▸ cliente.json: paleta "roxo" inválida — usando ambar
```

## Detalhes de implementação

- O HTML sai **pronto do build**, com os dados já dentro. A página funciona com o
  JavaScript desligado, e o preview do link no WhatsApp mostra nome e foto certos.
- A busca em `/representantes` filtra as fichas que já estão no HTML — sem `fetch`.
- Todos os caminhos são absolutos (`/css/style.css`), então `/dist` sobe na raiz
  de um domínio sem ajuste nenhum.
- Mobile: coluna estreita estilo Linktree. Desktop (≥900px): página do rep em
  duas colunas (perfil sticky + blocos).
- A paleta do cliente é injetada na página via override de CSS variables
  (`:root`), inclusive no glow do mapa.

## Paletas por cliente

Cinco opções pré-definidas. Sem `paleta` (ou valor inválido), usa `ambar`.

| ID | Direção | `--sinal` |
|---|---|---|
| `ambar` | fundo claro frio + destaque âmbar (padrão My Rep) | `#F0A202` |
| `oceano` | azul petróleo + destaque ciano | `#1AA6B8` |
| `floresta` | verde-escuro + destaque verde vivo | `#2F9E5B` |
| `rubi` | grafite + destaque vermelho-tijolo | `#C44B3A` |
| `ardosia` | cinza-ardósia + destaque cobre | `#C47A3A` |

Tokens aplicados por página: `--ink`, `--ink-soft`, `--papel`, `--sinal`,
`--sinal-escuro`, `--sinal-rgb`, `--borda`, `--mutado`, `--texto`.

Fontes: Bricolage Grotesque (títulos), Figtree (corpo).
