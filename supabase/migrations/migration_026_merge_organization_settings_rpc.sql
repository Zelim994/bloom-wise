-- migration_026: add atomic organization settings merge RPC
--
-- Баг: uploadOrganizationLogo и updateOrganizationSettings обновляли
-- organizations.settings через отдельные циклы
-- "SELECT settings → merge в JS → UPDATE settings целиком".
-- Это non-atomic read-merge-write: если обе операции выполняются близко
-- по времени (реалистичный сценарий — загрузить лого, затем нажать
-- "Сохранить" для остальных полей формы), более позднее по коммиту
-- UPDATE может перезаписать settings снапшотом, снятым ДО того как
-- другая операция сохранила свои изменения — logo_url/logo_path (или
-- наоборот phone/whatsapp/address/...) молча исчезают.
--
-- Эта функция делает merge атомарно на уровне Postgres:
--   settings = coalesce(settings, '{}'::jsonb) || patch
-- в одном UPDATE-выражении, что устраняет race независимо от таймингов
-- клиента.
--
-- Защиты:
--   1. Только authenticated пользователь (auth.uid())
--   2. Только owner/admin организации могут вызывать
--   3. patch должен быть jsonb-объектом
--   4. Разрешены только известные ключи (logo_url, logo_path, phone,
--      whatsapp, address, currency, timezone) — произвольные ключи
--      отклоняются
--   5. organization_id берётся из профиля вызывающего, а не от клиента
--   6. SECURITY DEFINER + set search_path = public, как в остальных RPC

create or replace function public.merge_organization_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id     uuid;
  v_caller_role   text;
  v_caller_org    uuid;
  v_allowed_keys  text[] := array[
    'logo_url', 'logo_path', 'phone', 'whatsapp', 'address', 'currency', 'timezone'
  ];
  v_key           text;
  v_new_settings  jsonb;
begin
  -- 1. Авторизация
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- 2. Базовая валидация аргумента
  if p_patch is null then
    return jsonb_build_object('error', 'patch_required');
  end if;

  if jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('error', 'patch_must_be_object');
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

  -- 4. Только owner/admin могут менять настройки организации
  if v_caller_role not in ('owner', 'admin') then
    return jsonb_build_object('error', 'insufficient_permissions');
  end if;

  -- 5. Разрешаем менять только известный набор ключей
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed_keys)) then
      return jsonb_build_object('error', 'key_not_allowed', 'key', v_key);
    end if;
  end loop;

  -- 6. Атомарный merge в одном UPDATE — устраняет read-merge-write race
  update public.organizations
     set settings   = coalesce(settings, '{}'::jsonb) || p_patch,
         updated_at = now()
   where id = v_caller_org
  returning settings into v_new_settings;

  if not found then
    return jsonb_build_object('error', 'organization_not_found');
  end if;

  return jsonb_build_object('ok', true, 'settings', v_new_settings);
end;
$$;

-- Убираем дефолтный PUBLIC-доступ
revoke all on function public.merge_organization_settings(jsonb) from public;
revoke all on function public.merge_organization_settings(jsonb) from anon;
-- Только авторизованные пользователи (дополнительные проверки внутри функции)
grant execute on function public.merge_organization_settings(jsonb) to authenticated;
