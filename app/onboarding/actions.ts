"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { normalizeOrganizationName } from "@/lib/auth/onboarding"

export type OnboardingActionState = { error: string | null }

function mapBootstrapError(message: string): string {
  if (message.includes("Профиль пользователя не найден")) return "Профиль пользователя не найден"
  if (message.includes("Not authenticated")) return "Нужно войти в систему"
  return "Не удалось создать салон. Попробуйте ещё раз."
}

/**
 * Единственная точка создания организации в приложении.
 *
 * Клиент передаёт только название. Пользователь, профиль и принадлежность
 * перепроверяются на сервере при каждом вызове, а сам RPC берёт identity из
 * auth.uid() и идемпотентен: повторная отправка (двойной клик, повтор после
 * таймаута, вторая вкладка) возвращает уже созданную организацию.
 */
export async function createOrganization(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const parsed = normalizeOrganizationName(formData.get("organizationName"))
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { error: "Нужно войти в систему" }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id, is_active")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) return { error: "Не удалось загрузить профиль. Попробуйте ещё раз." }
  if (!profile) return { error: "Профиль пользователя не найден" }
  if (profile.is_active === false) redirect("/deactivated")
  // Организация уже есть (например, создана в другой вкладке) — не вызываем RPC
  if (profile.organization_id) redirect("/")

  const { data: organizationId, error: rpcError } = await supabase.rpc(
    "create_my_organization",
    { p_org_name: parsed.name }
  )

  if (rpcError) return { error: mapBootstrapError(rpcError.message) }
  if (!organizationId) return { error: "Не удалось создать салон. Попробуйте ещё раз." }

  revalidatePath("/", "layout")
  redirect("/")
}
