-- migration_023: add secure team member active toggle RPC
--
-- Прямой UPDATE profiles SET is_active = ... заблокирован после migration_020:
--   - column-level UPDATE на 'is_active' для 'authenticated' отсутствует
--   - table-level UPDATE для 'authenticated' отозван
--
-- Эта функция обходит ограничение через SECURITY DEFINER (запускается
-- от имени postgres), но содержит полный набор проверок внутри SQL.
-- Функция НЕ меняет role, organization_id, branch_id или другие поля.
--
-- Защиты:
--   1. Только owner/admin могут вызывать
--   2. Нельзя деактивировать самого себя (self-lockout protection)
--   3. Нельзя деактивировать последнего активного owner организации
--   4. admin не может деактивировать/реактивировать owner или другого admin
--   5. Цель должна быть в той же организации (cross-org protection)
--   6. Caller сам должен быть активен (is_active = true)

create or replace function public.toggle_team_member_active(
  p_target_profile_id uuid,
  p_is_active         boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id      uuid;
  v_caller_role    text;
  v_caller_org     uuid;
  v_caller_active  boolean;
  v_target_role    text;
  v_target_org     uuid;
  v_active_owners  integer;
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

  if p_is_active is null then
    return jsonb_build_object('error', 'is_active_required');
  end if;

  -- 3. Профиль вызывающего
  select p.role, p.organization_id, p.is_active
    into v_caller_role, v_caller_org, v_caller_active
    from public.profiles p
   where p.id = v_caller_id;

  if not found then
    return jsonb_build_object('error', 'caller_profile_not_found');
  end if;

  if v_caller_org is null then
    return jsonb_build_object('error', 'caller_organization_not_found');
  end if;

  -- 4. Caller сам должен быть активен
  if v_caller_active = false then
    return jsonb_build_object('error', 'caller_is_inactive');
  end if;

  -- 5. Только owner/admin могут вызывать
  if v_caller_role not in ('owner', 'admin') then
    return jsonb_build_object('error', 'insufficient_permissions');
  end if;

  -- 6. Нельзя менять самого себя
  if p_target_profile_id = v_caller_id then
    return jsonb_build_object('error', 'cannot_toggle_self');
  end if;

  -- 7. Профиль цели
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

  -- 8. Цель должна быть в той же организации
  if v_target_org <> v_caller_org then
    return jsonb_build_object('error', 'cross_organization_forbidden');
  end if;

  -- 9. admin не может трогать owner или другого admin
  if v_caller_role = 'admin' and v_target_role in ('owner', 'admin') then
    return jsonb_build_object('error', 'admin_cannot_toggle_owner_or_admin');
  end if;

  -- 10. Нельзя деактивировать последнего активного owner
  if p_is_active = false and v_target_role = 'owner' then
    select count(*)
      into v_active_owners
      from public.profiles p
     where p.organization_id = v_caller_org
       and p.role = 'owner'
       and p.is_active = true;

    if v_active_owners <= 1 then
      return jsonb_build_object('error', 'cannot_deactivate_last_active_owner');
    end if;
  end if;

  -- 11. Обновляем только is_active и updated_at
  update public.profiles
     set is_active  = p_is_active,
         updated_at = now()
   where id = p_target_profile_id;

  return jsonb_build_object(
    'ok',         true,
    'profile_id', p_target_profile_id,
    'is_active',  p_is_active
  );
end;
$$;

-- Убираем дефолтный PUBLIC-доступ
revoke all on function public.toggle_team_member_active(uuid, boolean) from public;
revoke all on function public.toggle_team_member_active(uuid, boolean) from anon;
-- Только авторизованные пользователи (дополнительные проверки внутри функции)
grant execute on function public.toggle_team_member_active(uuid, boolean) to authenticated;
