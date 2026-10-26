-- My Rep — teste grátis de 14 dias com cartão (rodar no SQL Editor do Supabase ANTES do deploy)

alter table public.assinaturas drop constraint if exists assinaturas_status_check;
alter table public.assinaturas
  add constraint assinaturas_status_check
  check (status in ('ativa', 'inadimplente', 'cancelada', 'pendente', 'teste'));

alter table public.assinaturas
  add column if not exists teste_ate date,
  add column if not exists asaas_card_token text,
  add column if not exists cartao_bandeira text,
  add column if not exists cartao_ultimos text,
  add column if not exists documento_teste text;

-- Um teste por CPF/CNPJ.
create index if not exists assinaturas_documento_teste_idx
  on public.assinaturas (documento_teste);
