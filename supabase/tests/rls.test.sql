-- Testes das regras de acesso (RLS). Rodar num PostgreSQL local, depois de
-- supabase-stub.sql, schema.sql (duas vezes, para testar que é repetível) e
-- members.sql com os e-mails de teste. Qualquer falha interrompe com erro.
\set ON_ERROR_STOP on

create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

-- Visitante sem login (anon) não acessa nada
set role anon;
do $$ begin
  perform * from public.workspace;
  raise exception 'FALHOU: anon conseguiu ler workspace';
exception when insufficient_privilege then raise notice 'ok: anon não lê os dados';
end $$;
do $$ begin
  perform * from public.members;
  raise exception 'FALHOU: anon conseguiu ler members';
exception when insufficient_privilege then raise notice 'ok: anon não lê os membros';
end $$;
reset role;

-- Conta logada que NÃO é membro: não vê nem altera
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select pg_temp.check((select count(*) from public.workspace) = 0, 'não-membro não vê os dados');
select pg_temp.check((select count(*) from public.members) = 0, 'não-membro não vê os membros');
with u as (update public.workspace set data = '{}'::jsonb, version = version + 1 where id = 'main' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'não-membro não altera os dados');

-- Maria (membro) lê e grava com controle de versão
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.check((select count(*) from public.members) = 2, 'membro vê os dois sócios');
select pg_temp.check((select version from public.workspace where id = 'main') = 0, 'membro lê os dados (versão 0)');
with u as (update public.workspace set data = '{"teste": 1}'::jsonb, version = 1 where id = 'main' and version = 0 returning updated_by)
select pg_temp.check((select updated_by from u) = '11111111-1111-1111-1111-111111111111', 'membro grava e fica registrado como autor');
with u as (update public.workspace set data = '{"teste": 2}'::jsonb, version = 1 where id = 'main' and version = 0 returning 1)
select pg_temp.check((select count(*) from u) = 0, 'gravação com versão antiga é ignorada (conflito)');
do $$ begin
  update public.workspace set version = 5 where id = 'main';
  raise exception 'FALHOU: aceitou pular versões';
exception when raise_exception then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: não aceita pular versões';
end $$;

-- Membro não consegue se dar acesso a outras contas nem apagar dados
do $$ begin
  insert into public.members (user_id, app_user_id, name) values ('33333333-3333-3333-3333-333333333333', 'intruso', 'Intruso');
  raise exception 'FALHOU: membro adicionou outro membro';
exception when insufficient_privilege then raise notice 'ok: app não cria membros';
end $$;
do $$ begin
  delete from public.workspace;
  raise exception 'FALHOU: membro apagou os dados';
exception when insufficient_privilege then raise notice 'ok: app não apaga os dados';
end $$;

-- Wesley vê o que Maria gravou
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.check((select data->>'teste' from public.workspace where id = 'main') = '1', 'Wesley vê os dados gravados pela Maria');
reset role;
