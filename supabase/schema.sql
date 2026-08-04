-- My Rep — schema inicial (rodar no SQL Editor do Supabase)

create extension if not exists "pgcrypto";

create table if not exists public.representantes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  dados jsonb not null default '{}'::jsonb,
  publicado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

alter table public.representantes enable row level security;
alter table public.acessos enable row level security;
alter table public.pagamentos_eventos enable row level security;

drop policy if exists representantes_leitura_publica on public.representantes;
create policy representantes_leitura_publica on public.representantes
  for select
  using (publicado = true);

insert into storage.buckets (id, name, public)
values ('assets-clientes', 'assets-clientes', true)
on conflict (id) do update set public = true;

drop policy if exists assets_clientes_leitura_publica on storage.objects;
create policy assets_clientes_leitura_publica on storage.objects
  for select
  using (bucket_id = 'assets-clientes');
