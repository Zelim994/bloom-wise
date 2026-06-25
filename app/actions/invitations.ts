"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TEAM_ROLES, type TeamRole } from "@/lib/team/roles"

// ── Типы результатов ─────────────────────────────────────────────────────────

type ActionResult<T = undefined> = T extends undefined
  ? { success?: boolean; error?: string }
  : { success?: boolean; error?: string; data?: T }

type InvitationPreview = {
  organization_name: string
  role: string
  invited_name: string | null
  expires_at: string
}

type CreatedInvitation = {
  invitation_id: string
  token: string
  role: string
  expires_at: string
}

// ── Маппинг ошибок RPC ───────────────────────────────────────────────────────

function mapInvitationError(code: string): string {
  const map: Record<string, string> = {
    not_authenticated:              "Нужно войти в систему",
    role_required:                  "Не выбрана роль",
    invalid_role:                   "Недопустимая роль",
    cannot_invite_owner:            "Нельзя пригласить с ролью владельца",
    insufficient_permissions:       "Недостаточно прав",
    caller_profile_not_found:       "Профиль пользователя не найден",
    caller_organization_not_found:  "Организация пользователя не найдена",
    admin_cannot_invite_admin:      "Администратор не может приглашать администраторов",
    invitation_id_required:         "Не выбрано приглашение",
    invitation_not_found:           "Приглашение не найдено",
    invitation_already_accepted:    "Приглашение уже принято",
    invitation_already_revoked:     "Приглашение уже отозвано",
    cross_organization_forbidden:   "Нельзя управлять приглашениями другой организации",
    token_required:                 "Не указан токен приглашения",
    invitation_not_found_or_expired:"Приглашение не найдено или срок действия истёк",
    target_profile_not_found:       "Профиль пользователя не найден",
    already_in_organization:        "Пользователь уже состоит в организации",
  }
  return map[code] ?? "Не удалось выполнить действие с приглашением"
}

// ── createTeamInvitation ─────────────────────────────────────────────────────

export async function createTeamInvitation(input: {
  role: TeamRole
  invitedName?: string
  invitedPhone?: string
  invitedEmail?: string
}): Promise<ActionResult<CreatedInvitation>> {
  // 1. Валидация роли на уровне TS
  if (!TEAM_ROLES.includes(input.role)) {
    return { error: "Недопустимая роль" }
  }

  const supabase = await createClient()

  // 2. Авторизация
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { error: "Нужно войти в систему" }

  // 3. Профиль вызывающего
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single()

  if (!profile) return { error: "Профиль пользователя не найден" }
  if (!profile.organization_id) return { error: "Организация пользователя не найдена" }

  // 4. Только owner/admin (defense-in-depth до RPC)
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Недостаточно прав" }
  }

  // 5. Admin не может приглашать admin
  if (profile.role === "admin" && input.role === "admin") {
    return { error: "Администратор не может приглашать администраторов" }
  }

  // 6. Вызов RPC — главный рубеж безопасности
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "create_team_invitation",
    {
      p_role:          input.role,
      p_invited_name:  input.invitedName?.trim()  || null,
      p_invited_phone: input.invitedPhone?.trim() || null,
      p_invited_email: input.invitedEmail?.trim() || null,
    }
  )

  if (rpcError) return { error: rpcError.message }

  const result = rpcResult as {
    ok?: boolean
    error?: string
    invitation_id?: string
    token?: string
    role?: string
    expires_at?: string
  } | null

  if (result?.error) return { error: mapInvitationError(result.error) }

  revalidatePath("/settings/team")

  return {
    success: true,
    data: {
      invitation_id: result!.invitation_id!,
      token:         result!.token!,
      role:          result!.role!,
      expires_at:    result!.expires_at!,
    },
  }
}

// ── revokeTeamInvitation ─────────────────────────────────────────────────────

export async function revokeTeamInvitation(
  invitationId: string
): Promise<ActionResult> {
  if (!invitationId) return { error: "Не выбрано приглашение" }

  const supabase = await createClient()

  // 1. Авторизация
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { error: "Нужно войти в систему" }

  // 2. Профиль вызывающего
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single()

  if (!profile) return { error: "Профиль пользователя не найден" }
  if (!profile.organization_id) return { error: "Организация пользователя не найдена" }

  // 3. Только owner/admin
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Недостаточно прав" }
  }

  // 4. Вызов RPC
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "revoke_team_invitation",
    { p_invitation_id: invitationId }
  )

  if (rpcError) return { error: rpcError.message }

  const result = rpcResult as { ok?: boolean; error?: string; note?: string } | null

  if (result?.error) return { error: mapInvitationError(result.error) }

  revalidatePath("/settings/team")

  return { success: true }
}

// ── acceptTeamInvitation ─────────────────────────────────────────────────────

export async function acceptTeamInvitation(
  token: string
): Promise<ActionResult<{ organization_id: string; role: string }>> {
  if (!token) return { error: "Не указан токен приглашения" }

  const supabase = await createClient()

  // 1. Авторизация обязательна
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { error: "Нужно войти в систему" }

  // 2. Вызов RPC — RPC сама проверяет токен, expiry, уже-в-организации и т.д.
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "accept_team_invitation",
    { p_token: token }
  )

  if (rpcError) return { error: rpcError.message }

  const result = rpcResult as {
    ok?: boolean
    error?: string
    organization_id?: string
    role?: string
  } | null

  if (result?.error) return { error: mapInvitationError(result.error) }

  revalidatePath("/")
  revalidatePath("/settings/team")

  return {
    success: true,
    data: {
      organization_id: result!.organization_id!,
      role:            result!.role!,
    },
  }
}

// ── getTeamInvitationPreview ─────────────────────────────────────────────────

export async function getTeamInvitationPreview(
  token: string
): Promise<ActionResult<InvitationPreview>> {
  if (!token) return { error: "Не указан токен приглашения" }

  // Авторизация не требуется — страница /invite/[token] публичная
  const supabase = await createClient()

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "get_team_invitation_preview",
    { p_token: token }
  )

  if (rpcError) return { error: rpcError.message }

  const result = rpcResult as {
    ok?: boolean
    error?: string
    organization_name?: string
    role?: string
    invited_name?: string | null
    expires_at?: string
  } | null

  if (result?.error) return { error: mapInvitationError(result.error) }

  // Возвращаем только нечувствительные поля
  // token, phone, email, organization_id — не возвращаем
  return {
    success: true,
    data: {
      organization_name: result!.organization_name!,
      role:              result!.role!,
      invited_name:      result!.invited_name ?? null,
      expires_at:        result!.expires_at!,
    },
  }
}
