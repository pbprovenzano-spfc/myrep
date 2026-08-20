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
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  publicado_em timestamptz
);

-- Projetos já existentes: acrescenta colunas sem quebrar
alter table public.representantes add column if not exists publicado_em timestamptz;
alter table public.representantes add column if not exists email_cobranca text;
alter table public.representantes add column if not exists ativo boolean not null default true;
alter table public.representantes add column if not exists inadimplente_desde timestamptz;
alter table public.representantes add column if not exists controle_manual boolean not null default false;
alter table public.representantes add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists representantes_email_cobranca_idx
  on public.representantes (email_cobranca);

create unique index if not exists representantes_user_id_uniq
  on public.representantes (user_id)
  where user_id is not null;

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plano text not null,
  status text not null default 'ativa'
    check (status in ('ativa', 'inadimplente', 'cancelada', 'pendente')),
  asaas_customer_id text,
  asaas_subscription_id text,
  asaas_payment_id text,
  proxima_cobranca date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists assinaturas_user_id_uniq
  on public.assinaturas (user_id);

create index if not exists assinaturas_status_idx on public.assinaturas (status);
create index if not exists assinaturas_asaas_customer_idx
  on public.assinaturas (asaas_customer_id);

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
  tipo text not null check (tipo in ('briefing', 'alteracao', 'suporte')),
  assunto text not null default '',
  remetente_nome text,
  remetente_email text,
  slug text,
  user_id uuid references auth.users (id) on delete set null,
  dados jsonb not null default '{}'::jsonb,
  corpo text not null default '',
  lida boolean not null default false,
  status text not null default 'nova'
    check (status in ('nova', 'em_andamento', 'publicada', 'arquivada')),
  email_id text,
  email_erro text,
  created_at timestamptz not null default now()
);

alter table public.mensagens add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists mensagens_created_at_idx on public.mensagens (created_at desc);
create index if not exists mensagens_tipo_idx on public.mensagens (tipo);
create index if not exists mensagens_lida_idx on public.mensagens (lida);
create index if not exists mensagens_user_id_idx on public.mensagens (user_id);

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

create table if not exists public.mensagens_respostas (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.mensagens (id) on delete cascade,
  autor text not null check (autor in ('admin', 'usuario')),
  corpo text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists mensagens_respostas_mensagem_id_idx
  on public.mensagens_respostas (mensagem_id);

alter table public.representantes enable row level security;
alter table public.assinaturas enable row level security;
alter table public.acessos enable row level security;
alter table public.pagamentos_eventos enable row level security;
alter table public.mensagens enable row level security;
alter table public.mensagens_anexos enable row level security;
alter table public.mensagens_respostas enable row level security;

drop policy if exists representantes_leitura_publica on public.representantes;
create policy representantes_leitura_publica on public.representantes
  for select
  using (publicado = true);

drop policy if exists representantes_dono_select on public.representantes;
create policy representantes_dono_select on public.representantes
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists representantes_dono_update on public.representantes;
create policy representantes_dono_update on public.representantes
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists representantes_dono_insert on public.representantes;
create policy representantes_dono_insert on public.representantes
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists assinaturas_dono_select on public.assinaturas;
create policy assinaturas_dono_select on public.assinaturas
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists mensagens_dono_select on public.mensagens;
create policy mensagens_dono_select on public.mensagens
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists mensagens_dono_insert on public.mensagens;
create policy mensagens_dono_insert on public.mensagens
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists mensagens_respostas_dono_select on public.mensagens_respostas;
create policy mensagens_respostas_dono_select on public.mensagens_respostas
  for select
  to authenticated
  using (
    exists (
      select 1 from public.mensagens m
      where m.id = mensagem_id and m.user_id = auth.uid()
    )
  );

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

drop policy if exists assets_clientes_dono_insert on storage.objects;
create policy assets_clientes_dono_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'assets-clientes');

drop policy if exists assets_clientes_dono_update on storage.objects;
create policy assets_clientes_dono_update on storage.objects
  for update
  to authenticated
  using (bucket_id = 'assets-clientes')
  with check (bucket_id = 'assets-clientes');

drop policy if exists assets_clientes_dono_delete on storage.objects;
create policy assets_clientes_dono_delete on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'assets-clientes');
