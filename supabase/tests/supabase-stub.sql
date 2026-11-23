-- Simula as partes do Supabase usadas pelo schema, para testar num PostgreSQL comum.
-- NÃO rode isto no Supabase de verdade.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'maria@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'wesley@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'intruso@example.com');

-- Armazenamento de arquivos (Storage), só o necessário para testar storage.sql.
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
