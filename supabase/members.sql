-- =====================================================================
-- Mawe OS — liga as contas de login aos perfis dos sócios.
-- Rode DEPOIS de criar as duas contas em Authentication → Users.
-- 1) Troque os dois e-mails abaixo pelos e-mails reais das contas.
-- 2) Cole em SQL Editor → New query → Run.
-- =====================================================================

insert into public.members (user_id, app_user_id, name, role)
select id, 'maria', 'Maria Eduarda', 'socio'
from auth.users
where email = lower('EMAIL-DA-MARIA@exemplo.com')
on conflict (user_id) do update set app_user_id = excluded.app_user_id, name = excluded.name, role = excluded.role;

insert into public.members (user_id, app_user_id, name, role)
select id, 'wesley', 'Wesley', 'socio'
from auth.users
where email = lower('EMAIL-DO-WESLEY@exemplo.com')
on conflict (user_id) do update set app_user_id = excluded.app_user_id, name = excluded.name, role = excluded.role;

-- Confira: devem aparecer duas linhas.
select m.app_user_id, m.name, u.email
from public.members m
join auth.users u on u.id = m.user_id;
