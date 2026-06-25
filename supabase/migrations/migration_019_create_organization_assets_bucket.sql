-- migration_019: create organization-assets storage bucket
-- Public bucket for organization branding files (logo, etc.).
-- Path convention: {organization_id}/logo/{filename}
-- SELECT is public (logo is shown in Sidebar without auth).
-- INSERT/UPDATE/DELETE restricted to authenticated users of the same organization.

-- 1. Create public bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-assets',
  'organization-assets',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 2. Drop policies if they exist (idempotent re-run)
drop policy if exists "org_assets_select" on storage.objects;
drop policy if exists "org_assets_insert" on storage.objects;
drop policy if exists "org_assets_update" on storage.objects;
drop policy if exists "org_assets_delete" on storage.objects;

-- 3. SELECT — public read (logo visible in Sidebar without authentication)
create policy "org_assets_select"
  on storage.objects for select
  to public
  using (
    bucket_id = 'organization-assets'
  );

-- 4. INSERT — upload to own organization folder only
create policy "org_assets_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'organization-assets'
    and split_part(name, '/', 1) = get_user_organization_id()::text
  );

-- 5. UPDATE — replace own organization files (needed for upsert)
create policy "org_assets_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'organization-assets'
    and split_part(name, '/', 1) = get_user_organization_id()::text
  )
  with check (
    bucket_id = 'organization-assets'
    and split_part(name, '/', 1) = get_user_organization_id()::text
  );

-- 6. DELETE — delete own organization files
create policy "org_assets_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'organization-assets'
    and split_part(name, '/', 1) = get_user_organization_id()::text
  );
