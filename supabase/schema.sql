-- My Rep — schema inicial (rodar no SQL Editor do Supabase)

create extension if not exists "pgcrypto";

create table if not exists public.representantes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  dados jsonb not null default '{}'::jsonb,
  publicado boolean not null default true,
  email_cobranca text,
  ativo boolean not null default true,
  inadimplente_desde timestamptz,
  controle_manual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Projetos já existentes: acrescenta colunas sem quebrar
alter table public.representantes add column if not exists email_cobranca text;
alter table public.representantes add column if not exists ativo boolean not null default true;
alter table public.representantes add column if not exists inadimplente_desde timestamptz;
alter table public.representantes add column if not exists controle_manual boolean not null default false;

create index if not exists representantes_email_cobranca_idx
  on public.representantes (email_cobranca);

create table if not exists public.acessos (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plano text not null,
  payment_id text,
  asaas_customer_id text,
  token_hash text,
  expira_em timestamptz not null,
  origem text not null check (origem in ('liberar', 'admin', 'webhook')),
  created_at timestamptz not null default now()
);

create index if not exists acessos_email_idx on public.acessos (email);
create index if not exists acessos_created_at_idx on public.acessos (created_at desc);

create table if not exists public.pagamentos_eventos (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  payment_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pagamentos_eventos_payment_id_idx on public.pagamentos_eventos (payment_id);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('briefing', 'alteracao')),
  assunto text not null default '',
  remetente_nome text,
  remetente_email text,
  slug text,
  dados jsonb not null default '{}'::jsonb,
  corpo text not null default '',
  lida boolean not null default false,
  status text not null default 'nova'
    check (status in ('nova', 'em_andamento', 'publicada', 'arquivada')),
  email_id text,
  email_erro text,
  created_at timestamptz not null default now()
);

create index if not exists mensagens_created_at_idx on public.mensagens (created_at desc);
create index if not exists mensagens_tipo_idx on public.mensagens (tipo);
create index if not exists mensagens_lida_idx on public.mensagens (lida);

create table if not exists public.mensagens_anexos (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.mensagens (id) on delete cascade,
  nome text not null,
  caminho text not null,
  tipo text,
  tamanho integer not null default 0,
  origem text not null default 'upload' check (origem in ('zip', 'upload')),
  created_at timestamptz not null default now()
);

create index if not exists mensagens_anexos_mensagem_id_idx on public.mensagens_anexos (mensagem_id);

alter table public.representantes enable row level security;
alter table public.acessos enable row level security;
alter table public.pagamentos_eventos enable row level security;
alter table public.mensagens enable row level security;
alter table public.mensagens_anexos enable row level security;

drop policy if exists representantes_leitura_publica on public.representantes;
create policy representantes_leitura_publica on public.representantes
  for select
  using (publicado = true);

insert into storage.buckets (id, name, public)
values ('assets-clientes', 'assets-clientes', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('inbox', 'inbox', false)
on conflict (id) do update set public = false;

drop policy if exists assets_clientes_leitura_publica on storage.objects;
create policy assets_clientes_leitura_publica on storage.objects
  for select
  using (bucket_id = 'assets-clientes');
