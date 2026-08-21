-- My Rep — códigos vitalícios de uso único (rodar no SQL Editor do Supabase)

create table if not exists public.codigos_vitalicios (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  criado_em timestamptz not null default now(),
  reservado_email text,
  reservado_em timestamptz,
  usado_em timestamptz,
  usado_por uuid references auth.users (id) on delete set null
);

create index if not exists codigos_vitalicios_codigo_idx on public.codigos_vitalicios (codigo);
create index if not exists codigos_vitalicios_reservado_email_idx
  on public.codigos_vitalicios (reservado_email)
  where reservado_email is not null;
create index if not exists codigos_vitalicios_usado_em_idx
  on public.codigos_vitalicios (usado_em)
  where usado_em is null;

alter table public.codigos_vitalicios enable row level security;
