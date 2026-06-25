-- migration_022: team_invitations table + RLS + create/accept/revoke/preview RPCs
--
-- Приглашения сотрудников через invite-token.
-- Прямые INSERT/UPDATE/DELETE на таблицу не открываются — только через SECURITY DEFINER RPC.
-- accept_team_invitation меняет profiles.organization_id и profiles.role — действия,
-- заблокированные для обычного authenticated после migration_020/021.

-- ── 1. ТАБЛИЦА ───────────────────────────────────────────────────────────────

create table if not exists public.team_invitations (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  invited_by      uuid        not null references public.profiles(id) on delete cascade,

  role            text        not null
                  check (role in ('admin', 'florist', 'cashier', 'viewer')),

  invited_name    text,
  invited_phone   text,
  invited_email   text,

  token           text        not null unique
                  default encode(gen_random_bytes(32), 'hex'),

  expires_at      timestamptz not null default now() + interval '7 days',
  accepted_at     timestamptz,
  accepted_by     uuid        references public.profiles(id) on delete set null,
  revoked_at      timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 2. ИНДЕКСЫ ───────────────────────────────────────────────────────────────

create index if not exists team_invitations_token_idx
  on public.team_invitations(token);

create index if not exists team_invitations_org_idx
  on public.team_invitations(organization_id);

-- частичный индекс: только активные (не принятые, не отозванные)
create index if not exists team_invitations_active_idx
  on public.team_invitations(organization_id)
  where accepted_at is null and revoked_at is null;

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

alter table public.team_invitations enable row level security;

drop policy if exists "team_invitations_select_org"            on public.team_invitations;
drop policy if exists "team_invitations_select_manage_org"     on public.team_invitations;
drop policy if exists "team_invitations_public_active_preview" on public.team_invitations;

-- SELECT: только owner/admin своей организации
-- Рядовые флористы/кассиры/viewers не видят список приглашений
create policy "team_invitations_select_manage_org"
  on public.team_invitations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id              = auth.uid()
        and p.organization_id = team_invitations.organization_id
        and p.role            in ('owner', 'admin')
    )
  );

-- Прямой публичный SELECT не открывается.
-- Публичная страница /invite/[token] использует SECURITY DEFINER RPC
-- get_team_invitation_preview(), которая возвращает только нечувствительные поля.

-- ── 4. RPC: create_team_invitation ──────────────────────────────────────────

create or replace function public.create_team_invitation(
  p_role          text,
  p_invited_name  text default null,
  p_invited_phone text default null,
  p_invited_email text default null
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
  v_inv_id       uuid;
  v_token        text;
  v_expires_at   timestamptz;
begin
  -- 1. Авторизация
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- 2. Аргументы
  if p_role is null then
    return jsonb_build_object('error', 'role_required');
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

  -- 4. Только owner/admin
  if v_caller_role not in ('owner', 'admin') then
    return jsonb_build_object('error', 'insufficient_permissions');
  end if;

  -- 5. Нельзя пригласить owner
  if p_role = 'owner' then
    return jsonb_build_object('error', 'cannot_invite_owner');
  end if;

  -- 6. Разрешённые роли
  if p_role not in ('admin', 'florist', 'cashier', 'viewer') then
    return jsonb_build_object('error', 'invalid_role');
  end if;

  -- 7. Admin не может приглашать admin
  if v_caller_role = 'admin' and p_role = 'admin' then
    return jsonb_build_object('error', 'admin_cannot_invite_admin');
  end if;

  -- 8. Создаём приглашение (token генерируется default)
  insert into public.team_invitations (
    organization_id,
    invited_by,
    role,
    invited_name,
    invited_phone,
    invited_email
  )
  values (
    v_caller_org,
    v_caller_id,
    p_role,
    p_invited_name,
    p_invited_phone,
    p_invited_email
  )
  returning id, token, expires_at
    into v_inv_id, v_token, v_expires_at;

  return jsonb_build_object(
    'ok',            true,
    'invitation_id', v_inv_id,
    'token',         v_token,
    'role',          p_role,
    'expires_at',    v_expires_at
  );
end;
$$;

revoke execute on function public.create_team_invitation(text, text, text, text) from public;
revoke execute on function public.create_team_invitation(text, text, text, text) from anon;
grant  execute on function public.create_team_invitation(text, text, text, text) to authenticated;

-- ── 5. RPC: accept_team_invitation ──────────────────────────────────────────

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
     and expires_at  > now();

  if not found then
    return jsonb_build_object('error', 'invitation_not_found_or_expired');
  end if;

  -- 4. Профиль вызывающего
  select organization_id
    into v_caller_org
    from public.profiles
   where id = v_caller_id;

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

revoke execute on function public.accept_team_invitation(text) from public;
revoke execute on function public.accept_team_invitation(text) from anon;
grant  execute on function public.accept_team_invitation(text) to authenticated;

-- ── 6. RPC: revoke_team_invitation ──────────────────────────────────────────

create or replace function public.revoke_team_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id   uuid;
  v_caller_role text;
  v_caller_org  uuid;
  v_inv_org     uuid;
  v_accepted_at timestamptz;
  v_revoked_at  timestamptz;
begin
  -- 1. Авторизация
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- 2. Аргумент
  if p_invitation_id is null then
    return jsonb_build_object('error', 'invitation_id_required');
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

  -- 4. Только owner/admin
  if v_caller_role not in ('owner', 'admin') then
    return jsonb_build_object('error', 'insufficient_permissions');
  end if;

  -- 5. Найти invitation
  select organization_id, accepted_at, revoked_at
    into v_inv_org, v_accepted_at, v_revoked_at
    from public.team_invitations
   where id = p_invitation_id;

  if not found then
    return jsonb_build_object('error', 'invitation_not_found');
  end if;

  -- 6. Только своя организация
  if v_inv_org <> v_caller_org then
    return jsonb_build_object('error', 'cross_organization_forbidden');
  end if;

  -- 7. Уже принятое нельзя отозвать
  if v_accepted_at is not null then
    return jsonb_build_object('error', 'invitation_already_accepted');
  end if;

  -- 8. Уже отозванное — идемпотентный OK
  if v_revoked_at is not null then
    return jsonb_build_object('ok', true, 'note', 'already_revoked');
  end if;

  -- 9. Отзываем
  update public.team_invitations
     set revoked_at = now(),
         updated_at = now()
   where id = p_invitation_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.revoke_team_invitation(uuid) from public;
revoke execute on function public.revoke_team_invitation(uuid) from anon;
grant  execute on function public.revoke_team_invitation(uuid) to authenticated;

-- ── 7. RPC: get_team_invitation_preview ─────────────────────────────────────
-- Публичная страница /invite/[token] вызывает эту функцию с token из URL.
-- Возвращает только нечувствительные поля.
-- Не возвращает: token, invited_phone, invited_email, organization_id, invited_by, accepted_by.
-- Доступна anon: пользователь должен видеть инфо о приглашении до входа в аккаунт.

create or replace function public.get_team_invitation_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return jsonb_build_object('error', 'token_required');
  end if;

  select jsonb_build_object(
    'ok',                true,
    'organization_name', o.name,
    'role',              ti.role,
    'invited_name',      ti.invited_name,
    'expires_at',        ti.expires_at
  )
    into v_result
    from public.team_invitations ti
    join public.organizations o on o.id = ti.organization_id
   where ti.token      = p_token
     and ti.accepted_at is null
     and ti.revoked_at  is null
     and ti.expires_at  > now()
   limit 1;

  if v_result is null then
    return jsonb_build_object('error', 'invitation_not_found_or_expired');
  end if;

  return v_result;
end;
$$;

revoke execute on function public.get_team_invitation_preview(text) from public;
grant  execute on function public.get_team_invitation_preview(text) to anon;
grant  execute on function public.get_team_invitation_preview(text) to authenticated;
