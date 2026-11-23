-- =====================================================================
-- Mawe OS — armazenamento das provas das aprovações (prints e PDFs)
-- Rode DEPOIS do schema.sql: Supabase → SQL Editor → New query → Run.
-- Pode ser executado mais de uma vez sem duplicar nada.
-- =====================================================================

-- Pasta privada "provas": nada é público, só quem está logado e é membro.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provas', 'provas', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Membros do Mawe OS veem, enviam e apagam arquivos da pasta "provas".
-- Não há regra de alteração: um print enviado não pode ser trocado, só apagado.
drop policy if exists "membros veem as provas" on storage.objects;
create policy "membros veem as provas" on storage.objects
  for select to authenticated
  using (bucket_id = 'provas' and public.is_member());

drop policy if exists "membros enviam provas" on storage.objects;
create policy "membros enviam provas" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'provas' and public.is_member());

drop policy if exists "membros apagam provas" on storage.objects;
create policy "membros apagam provas" on storage.objects
  for delete to authenticated
  using (bucket_id = 'provas' and public.is_member());
