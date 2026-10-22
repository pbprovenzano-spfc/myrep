-- My Rep — estatísticas de visitas e cliques no WhatsApp (rodar no SQL Editor do Supabase)

-- Estatísticas das páginas públicas: contagem diária agregada, sem dado pessoal
create table if not exists public.estatisticas_diarias (
  slug text not null,
  dia date not null,
  visitas integer not null default 0,
  cliques_whatsapp integer not null default 0,
  primary key (slug, dia)
);

alter table public.estatisticas_diarias enable row level security;

-- Soma 1 visita ou 1 clique no dia corrente (horário de Brasília).
create or replace function public.registrar_estatistica(p_slug text, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_tipo not in ('visita', 'whatsapp') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;
  insert into public.estatisticas_diarias (slug, dia, visitas, cliques_whatsapp)
  values (
    p_slug,
    v_dia,
    case when p_tipo = 'visita' then 1 else 0 end,
    case when p_tipo = 'whatsapp' then 1 else 0 end
  )
  on conflict (slug, dia) do update set
    visitas = estatisticas_diarias.visitas + excluded.visitas,
    cliques_whatsapp = estatisticas_diarias.cliques_whatsapp + excluded.cliques_whatsapp;
end;
$$;

revoke all on function public.registrar_estatistica(text, text) from public, anon, authenticated;
