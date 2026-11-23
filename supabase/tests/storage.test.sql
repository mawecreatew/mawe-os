-- Testes das regras do armazenamento das provas. Rodar depois de rls.test.sql
-- e de storage.sql (duas vezes, para testar que é repetível).
\set ON_ERROR_STOP on

create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

select pg_temp.check((select public = false from storage.buckets where id = 'provas'), 'pasta de provas é privada');

-- Maria (membro) envia e vê um print
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into storage.objects (bucket_id, name) values ('provas', '2026-11/prova-1-print.png');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'provas') = 1, 'membro envia e vê a prova');

-- Wesley vê o print da Maria
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'provas') = 1, 'o outro sócio vê a prova');

-- Ninguém altera um print já enviado
with u as (update storage.objects set name = 'trocado.png' where bucket_id = 'provas' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'prova enviada não pode ser alterada');

-- Conta logada que não é membro: não vê, não envia, não apaga
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'provas') = 0, 'não-membro não vê as provas');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('provas', 'intruso.png');
  raise exception 'FALHOU: não-membro enviou arquivo';
exception when insufficient_privilege then raise notice 'ok: não-membro não envia provas';
end $$;
with d as (delete from storage.objects where bucket_id = 'provas' returning 1)
select pg_temp.check((select count(*) from d) = 0, 'não-membro não apaga as provas');

-- Membro apaga
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
with d as (delete from storage.objects where bucket_id = 'provas' returning 1)
select pg_temp.check((select count(*) from d) = 1, 'membro apaga a prova');
reset role;

-- Visitante sem login não acessa nada
set role anon;
do $$ begin
  perform * from storage.objects;
  raise exception 'FALHOU: anon leu as provas';
exception when insufficient_privilege then raise notice 'ok: anon não lê as provas';
end $$;
reset role;
