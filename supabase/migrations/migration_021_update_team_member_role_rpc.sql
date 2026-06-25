-- migration_021: add secure team member role update RPC
--
-- Прямой UPDATE profiles SET role = ... заблокирован после migration_020:
--   - column-level UPDATE на 'role' для 'authenticated' отсутствует
--   - table-level UPDATE для 'authenticated' отозван
--
-- Эта функция обходит ограничение через SECURITY DEFINER (запускается
-- от имени postgres), но содержит полный набор проверок внутри SQL.
-- Функция НЕ меняет organization_id, branch_id, is_active.
-- Назначение роли 'owner' запрещено — передача владения отдельная операция.

create or replace function public.update_team_member_role(
  p_target_profile_id uuid,
  p_new_role          text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id    uuid;
  v_caller_role  text;
  v_caller_org   uuid;
  v_target_role  text;
  v_target_org   uuid;
  v_owner_count  integer;
begin
  -- 1. Авторизация
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- 2. Базовая валидация аргументов
  if p_target_profile_id is null then
    return jsonb_build_object('error', 'target_profile_id_required');
  end if;

  if p_new_role is null then
    return jsonb_build_object('error', 'new_role_required');
  end if;

  -- 3. Профиль вызывающего
  select p.role, p.organization_id
    into v_caller_role, v_caller_org
    from public.profiles p
   where p.id = v_caller_id;

  if not found then
    return jsonb_build_object('error', 'caller_profile_not_found');
  end if;

  if v_caller_org is null then
    return jsonb_build_object('error', 'caller_organization_not_found');
  end if;

  -- 4. Только owner/admin могут вызывать
  if v_caller_role not in ('owner', 'admin') then
    return jsonb_build_object('error', 'insufficient_permissions');
  end if;

  -- 5. Профиль цели
  select p.role, p.organization_id
    into v_target_role, v_target_org
    from public.profiles p
   where p.id = p_target_profile_id;

  if not found then
    return jsonb_build_object('error', 'target_profile_not_found');
  end if;

  if v_target_org is null then
    return jsonb_build_object('error', 'target_organization_not_found');
  end if;

  -- 6. Цель должна быть в той же организации
  if v_target_org <> v_caller_org then
    return jsonb_build_object('error', 'cross_organization_forbidden');
  end if;

  -- 7. Нельзя назначать owner через эту функцию (передача владения — отдельная операция)
  if p_new_role = 'owner' then
    return jsonb_build_object('error', 'cannot_assign_owner_role');
  end if;

  -- 8. Разрешённые роли
  if p_new_role not in ('admin', 'florist', 'cashier', 'viewer') then
    return jsonb_build_object('error', 'invalid_role');
  end if;

  -- 9. Ограничения для admin:
  --    нельзя трогать owner/admin и нельзя назначать admin
  if v_caller_role = 'admin' and v_target_role in ('owner', 'admin') then
    return jsonb_build_object('error', 'admin_cannot_change_owner_or_admin');
  end if;

  if v_caller_role = 'admin' and p_new_role = 'admin' then
    return jsonb_build_object('error', 'admin_cannot_assign_admin');
  end if;

  -- 10. Нельзя понизить последнего owner
  if v_target_role = 'owner' then
    select count(*)
      into v_owner_count
      from public.profiles p
     where p.organization_id = v_caller_org
       and p.role = 'owner';

    if v_owner_count <= 1 then
      return jsonb_build_object('error', 'cannot_demote_last_owner');
    end if;
  end if;

  -- 11. Обновляем только role и updated_at
  update public.profiles
     set role       = p_new_role,
         updated_at = now()
   where id = p_target_profile_id;

  return jsonb_build_object(
    'ok',         true,
    'profile_id', p_target_profile_id,
    'new_role',   p_new_role
  );
end;
$$;

-- Убираем дефолтный PUBLIC-доступ
revoke execute on function public.update_team_member_role(uuid, text) from public;
revoke execute on function public.update_team_member_role(uuid, text) from anon;
-- Только авторизованные пользователи (дополнительные проверки внутри функции)
grant  execute on function public.update_team_member_role(uuid, text) to authenticated;
