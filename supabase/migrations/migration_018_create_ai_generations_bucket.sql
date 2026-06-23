-- migration_018: create ai-generations storage bucket
-- Private bucket for AI bouquet visualization images.
-- Path convention: {organization_id}/{generation_id}.png
-- Access restricted to authenticated users of the same organization only.

-- 1. Create private bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-generations',
  'ai-generations',
  false,
  10485760,
  array['image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 2. SELECT — read own organization files
create policy "ai_generations_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ai-generations'
    and split_part(name, '/', 1) = get_user_organization_id()::text
  );

-- 3. INSERT — upload to own organization folder
create policy "ai_generations_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ai-generations'
    and split_part(name, '/', 1) = get_user_organization_id()::text
  );

-- 4. DELETE — delete own organization files
create policy "ai_generations_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ai-generations'
    and split_part(name, '/', 1) = get_user_organization_id()::text
  );
