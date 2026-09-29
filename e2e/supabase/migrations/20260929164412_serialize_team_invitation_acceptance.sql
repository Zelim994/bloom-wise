-- Serialize one-time consumption and the caller membership check.
-- Bearer-link semantics, signature, return codes, owner and ACL stay unchanged.
-- Lock order: invitation, then caller profile. Concurrent calls recheck current rows.

create or replace function public.accept_team_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id  uuid;
  v_inv_id     uuid;
  v_inv_org    uuid;
  v_inv_role   text;
  v_caller_org uuid;
begin
  -- 1. Авторизация
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- 2. Аргумент
  if p_token is null or p_token = '' then
    return jsonb_build_object('error', 'token_required');
  end if;

  -- 3. Найти активное приглашение
  select id, organization_id, role
    into v_inv_id, v_inv_org, v_inv_role
    from public.team_invitations
   where token      = p_token
     and accepted_at is null
     and revoked_at  is null
     and expires_at  > now()
   for update;

  if not found then
    return jsonb_build_object('error', 'invitation_not_found_or_expired');
  end if;

  -- 4. Профиль вызывающего
  select organization_id
    into v_caller_org
    from public.profiles
   where id = v_caller_id
   for update;

  if not found then
    return jsonb_build_object('error', 'caller_profile_not_found');
  end if;

  -- 5. Уже состоит в организации
  if v_caller_org is not null then
    return jsonb_build_object('error', 'already_in_organization');
  end if;

  -- 6. Принимаем: organization_id и role берутся ТОЛЬКО из invitation (не из input)
  update public.profiles
     set organization_id = v_inv_org,
         role            = v_inv_role,
         updated_at      = now()
   where id = v_caller_id;

  -- 7. Помечаем invitation принятым
  update public.team_invitations
     set accepted_at = now(),
         accepted_by = v_caller_id,
         updated_at  = now()
   where id = v_inv_id;

  return jsonb_build_object(
    'ok',              true,
    'organization_id', v_inv_org,
    'role',            v_inv_role
  );
end;
$$;
