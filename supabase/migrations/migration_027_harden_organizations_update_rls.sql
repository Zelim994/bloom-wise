-- migration_027: harden organizations UPDATE RLS and column privileges
--
-- Было (migration_001, live DB):
-- org_update разрешал UPDATE organizations любому участнику организации:
--   for update using (id = get_user_organization_id())
-- WITH CHECK отсутствовал, роль не проверялась, колоночных ограничений
-- не было. Любая роль (florist/cashier/viewer) могла напрямую через
-- PostgREST менять name/slug/plan/settings своей организации.
--
-- Стало:
-- - UPDATE-политику проходят только owner/admin своей организации;
-- - authenticated может напрямую обновлять только колонки name, updated_at
--   (единственный прямой UPDATE в коде — organizations.name в
--   app/actions/settings.ts);
-- - slug/plan/settings недоступны для прямого UPDATE через PostgREST;
-- - settings продолжает меняться только через SECURITY DEFINER RPC
--   merge_organization_settings (migration_026) — definer-функции
--   не затрагиваются ни RLS-политикой, ни колоночными grants;
-- - create_my_organization (SECURITY DEFINER) продолжает работать.
--
-- Rollback (восстановление поведения до миграции):
--   drop policy if exists "org_update" on public.organizations;
--   create policy "org_update" on public.organizations
--     for update using (id = get_user_organization_id());
--   grant update on public.organizations to authenticated;

begin;

drop policy if exists "org_update" on public.organizations;

create policy "org_update"
  on public.organizations
  for update
  to authenticated
  using (
    id = get_user_organization_id()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = organizations.id
        and p.role in ('owner', 'admin')
    )
  )
  with check (
    id = get_user_organization_id()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = organizations.id
        and p.role in ('owner', 'admin')
    )
  );

revoke update on public.organizations from public;
revoke update on public.organizations from authenticated;
revoke update on public.organizations from anon;

grant update(name, updated_at) on public.organizations to authenticated;

commit;
