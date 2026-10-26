-- =====================================================================
-- Mawe OS — estrutura do banco no Supabase
-- Cole este arquivo inteiro em: Supabase → SQL Editor → New query → Run.
-- Pode ser executado mais de uma vez sem duplicar nada.
-- =====================================================================

-- Quem pode usar o Mawe OS. Cada linha liga uma conta de login a um perfil.
create table if not exists public.members (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  app_user_id text not null unique,          -- 'maria' ou 'wesley' (perfis do Mawe OS)
  name        text not null,
  role        text not null default 'socio' check (role in ('socio', 'colaborador')),
  created_at  timestamptz not null default now()
);

-- Dados da agência (um único registro compartilhado, linha 'main').
create table if not exists public.workspace (
  id          text primary key,
  data        jsonb,
  version     integer not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id)
);

insert into public.workspace (id, data, version)
values ('main', null, 0)
on conflict (id) do nothing;

-- A pessoa logada é membro do Mawe OS?
-- (security definer: consulta a tabela members sem depender das regras dela)
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

-- Cada gravação precisa avançar exatamente uma versão (evita que um sócio
-- sobrescreva sem querer a alteração do outro) e registra quem alterou.
create or replace function public.workspace_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.version <> old.version + 1 then
    raise exception 'Conflito de versão: os dados foram alterados por outra pessoa.';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists workspace_before_update on public.workspace;
create trigger workspace_before_update
  before update on public.workspace
  for each row execute function public.workspace_before_update();

-- ------------------------------------------------------------ Regras de acesso (RLS)
alter table public.members   enable row level security;
alter table public.workspace enable row level security;

drop policy if exists "membros veem os membros" on public.members;
create policy "membros veem os membros" on public.members
  for select to authenticated
  using (public.is_member());

drop policy if exists "membros leem os dados" on public.workspace;
create policy "membros leem os dados" on public.workspace
  for select to authenticated
  using (public.is_member());

drop policy if exists "membros alteram os dados" on public.workspace;
create policy "membros alteram os dados" on public.workspace
  for update to authenticated
  using (public.is_member())
  with check (public.is_member());

-- Ninguém sem login acessa nada. Pelo app não é possível criar/apagar membros
-- nem apagar os dados: isso só pelo painel do Supabase.
revoke all on public.members, public.workspace from anon;
revoke all on public.members, public.workspace from authenticated;
grant select on public.members to authenticated;
grant select, update on public.workspace to authenticated;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
