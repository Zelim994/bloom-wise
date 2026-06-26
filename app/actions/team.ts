"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { TEAM_ROLES, type TeamRole } from "@/lib/team/roles"

function mapTeamRoleError(code: string): string {
  const map: Record<string, string> = {
    not_authenticated:                "Нужно войти в систему",
    target_profile_id_required:       "Не выбран сотрудник",
    new_role_required:                "Не выбрана роль",
    caller_profile_not_found:         "Профиль пользователя не найден",
    caller_organization_not_found:    "Организация пользователя не найдена",
    insufficient_permissions:         "Недостаточно прав для изменения ролей",
    target_profile_not_found:         "Сотрудник не найден",
    target_organization_not_found:    "Организация сотрудника не найдена",
    cross_organization_forbidden:     "Нельзя менять роль сотрудника другой организации",
    cannot_assign_owner_role:         "Роль владельца нельзя назначить через эту форму",
    invalid_role:                     "Недопустимая роль",
    admin_cannot_change_owner_or_admin: "Администратор не может менять роль владельца или администратора",
    admin_cannot_assign_admin:        "Администратор не может назначать администраторов",
    cannot_demote_last_owner:         "Нельзя понизить последнего владельца организации",
  }
  return map[code] ?? "Не удалось изменить роль сотрудника"
}

export async function updateTeamMemberRole(
  targetProfileId: string,
  newRole: TeamRole
): Promise<{ error?: string; success?: boolean }> {
  // TS-уровень: валидация newRole
  if (!TEAM_ROLES.includes(newRole)) {
    return { error: "Недопустимая роль" }
  }

  if (!targetProfileId) {
    return { error: "Не выбран сотрудник" }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: "Нужно войти в систему" }
  }

  // Проверяем профиль вызывающего (defense-in-depth до RPC)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return { error: "Профиль пользователя не найден" }
  }

  if (!profile.organization_id) {
    return { error: "Организация пользователя не найдена" }
  }

  if (profile.role !== "owner" && profile.role !== "admin") {
    return { error: "Недостаточно прав для изменения ролей" }
  }

  // Вызываем SECURITY DEFINER RPC — все дальнейшие проверки внутри SQL
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "update_team_member_role",
    {
      p_target_profile_id: targetProfileId,
      p_new_role: newRole,
    }
  )

  if (rpcError) {
    return { error: rpcError.message }
  }

  // RPC возвращает jsonb: { ok: true } или { error: "код" }
  const result = rpcResult as { ok?: boolean; error?: string } | null

  if (result?.error) {
    return { error: mapTeamRoleError(result.error) }
  }

  revalidatePath("/settings/team")

  return { success: true }
}
