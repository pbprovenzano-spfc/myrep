-- My Rep — migração self-service (rodar no SQL Editor do Supabase)

-- Tipo suporte nas mensagens
alter table public.mensagens drop constraint if exists mensagens_tipo_check;
alter table public.mensagens add constraint mensagens_tipo_check
  check (tipo in ('briefing', 'alteracao', 'suporte'));

-- Data de publicação da página
alter table public.representantes add column if not exists publicado_em timestamptz;

-- Respostas de suporte (admin → usuário)
create table if not exists public.mensagens_respostas (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.mensagens (id) on delete cascade,
  autor text not null check (autor in ('admin', 'usuario')),
  corpo text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists mensagens_respostas_mensagem_id_idx
  on public.mensagens_respostas (mensagem_id);

alter table public.mensagens_respostas enable row level security;

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

-- Permite insert de mensagens suporte pelo dono (já existe mensagens_dono_insert)

-- Storage: usuário autenticado pode fazer upload nos próprios assets
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

-- Representantes: dono pode inserir (criação da página)
drop policy if exists representantes_dono_insert on public.representantes;
create policy representantes_dono_insert on public.representantes
  for insert
  to authenticated
  with check (user_id = auth.uid());
