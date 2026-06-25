-- migration_020: harden profiles_update RLS and column privileges
--
-- Было:
-- profiles_update разрешал пользователю обновлять любой профиль своей организации
-- и любые колонки, включая role/organization_id/branch_id/is_active.
-- (using: id = auth.uid() OR organization_id = get_user_organization_id())
-- (with_check: NULL — никаких ограничений на записываемые значения)
--
-- Стало:
-- authenticated пользователь может обновлять только свой профиль
-- и только безопасные колонки: full_name, phone, avatar_url, updated_at.
-- Колонки role/organization_id/branch_id/is_active недоступны для прямого UPDATE.
-- create_my_organization (SECURITY DEFINER, postgres) продолжает работать.

drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

grant update(full_name, phone, avatar_url, updated_at)
  on public.profiles
  to authenticated;
