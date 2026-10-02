-- My Rep — cancelamento agendado da assinatura (rodar no SQL Editor do Supabase)

alter table public.assinaturas
  add column if not exists cancelamento_agendado boolean not null default false;
