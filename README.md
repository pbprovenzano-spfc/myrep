# My Rep

Páginas únicas para representantes comerciais. Cada perfil tem uma rota por path:
`/kp-representacao`, `/silva-protecao`, e assim por diante.

A home (`/`) é a landing do produto. A lista interna de perfis fica em
`/representantes` (sem link público por enquanto).

Gerador estático: um script Node lê os JSONs e gera `/dist`. O briefing do
cliente fica em `/briefing/` e envia um ZIP por e-mail via **Resend** (função
serverless na **Vercel**).

## Rodar

```bash
npm install          # só precisa por causa do Resend (api/briefing)
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
  briefing.html        formulário de cadastro
  representantes.html  diretório interno
publico/
  css/style.css
  js/briefing.js       monta JSON + ZIP e POST /api/briefing
  js/mapa.js
  js/representantes.js
api/
  briefing.js          Vercel function → e-mail com ZIP (Resend)
assets-clientes/<slug>/
geo/
build.js
dev.js                 servidor local (salva ZIP em /inbox se sem Resend)
vercel.json
.env.example
dist/
inbox/                 ZIPs locais do dev (não versionar)
```

## Briefing no site (`/briefing/`)

Fluxo:

1. Cliente preenche o formulário (escolhe se a representada ou o nome próprio fica em evidência), anexa foto, logos e PDFs.
2. O browser gera o `slug` da URL a partir do nome em evidência e monta o ZIP (`clientes/<slug>.json` + `assets-clientes/<slug>/`).
3. `POST /api/briefing` envia o ZIP para o seu e-mail com **Resend**.
4. Você descompacta na raiz do projeto (ou me envia o ZIP) e gera a página.

Limite prático: ~**4 MB** por envio (limite da Vercel Hobby). Comprima imagens/PDFs grandes.

### Configurar Resend + Vercel

1. Crie conta em [resend.com](https://resend.com), gere uma API key e (em produção) verifique seu domínio.
2. Copie `.env.example` → `.env` e preencha:

```bash
RESEND_API_KEY=re_xxxxxxxx
BRIEFING_TO_EMAIL=voce@seudominio.com
BRIEFING_FROM_EMAIL=My Rep <ola@seudominio.com>
```

3. Na Vercel: importe o repo, use build `npm run build` e output `dist` (já em `vercel.json`).
4. Em **Settings → Environment Variables**, cadastre as três variáveis acima.
5. Deploy. O formulário fica em `https://seu-dominio/briefing/`.

Em `npm run dev` sem Resend configurado, o ZIP é salvo em `/inbox` para você testar o fluxo.

### Pacote que chega no e-mail

```
clientes/<slug>.json
assets-clientes/<slug>/
  foto.ext
  marca-*.ext
  catalogo-*.pdf
```

Checklist: `slug` válido → WhatsApp só dígitos → nomes no JSON = arquivos na
pasta → `paleta` ∈ `ambar|oceano|floresta|rubi|ardosia`.

## Cadastrar um representante novo

1. Crie `clientes/nome-do-cliente.json`
2. Crie `assets-clientes/nome-do-cliente/` com foto, logos e PDFs
3. Rode `npm run geo` quando incluir UFs novas (baixa malhas municipais usadas nos JSONs)
4. Salve — o site reconstrói sozinho

## Campos do JSON

| Campo | Obrigatório | Observação |
|---|---|---|
| `slug` | sim | só minúsculas, números e hífen. Vira a URL (no briefing, gerado sozinho) |
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
