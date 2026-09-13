import type { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/lib/supabase/types"
import { ONBOARDING_PATH } from "@/lib/auth/onboarding"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

/**
 * Состояние аккаунта для гейтов DashboardLayout и /onboarding. Только чтение:
 * отсутствующий профиль или организация никогда не «чинятся» здесь.
 */
export type AccountState =
  | { status: "unauthenticated" }
  | { status: "profile_error" }
  | { status: "profile_missing" }
  | { status: "inactive"; profile: Profile }
  | { status: "orgless"; profile: Profile }
  | { status: "member"; profile: Profile; organizationId: string }

export async function getAccountState(supabase: ServerSupabase): Promise<AccountState> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: "unauthenticated" }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  // Ошибка запроса и отсутствие строки — разные ситуации: первую нельзя
  // выдавать за «профиля нет».
  if (error) return { status: "profile_error" }
  if (!profile) return { status: "profile_missing" }

  // Деактивация важнее отсутствия организации.
  if (profile.is_active === false) return { status: "inactive", profile }
  if (!profile.organization_id) return { status: "orgless", profile }
  return { status: "member", profile, organizationId: profile.organization_id }
}

/**
 * Куда DashboardLayout отправляет пользователя, которому нельзя в дашборд.
 * null — рендерить дашборд. Отсутствующий профиль уходит на /onboarding, где
 * показывается явная ошибка без формы: создать организацию без профиля нельзя,
 * а сам онбординг никуда не редиректит это состояние, так что цикла нет.
 */
export function getDashboardRedirect(state: AccountState): string | null {
  switch (state.status) {
    case "unauthenticated":
      return "/login"
    case "inactive":
      return "/deactivated"
    case "orgless":
    case "profile_missing":
      return ONBOARDING_PATH
    case "profile_error":
    case "member":
      return null
  }
}

/**
 * Куда /onboarding отправляет пользователя, которому форма не нужна.
 * null — остаться на странице (форма или сообщение об ошибке).
 */
export function getOnboardingRedirect(state: AccountState): string | null {
  switch (state.status) {
    case "unauthenticated":
      return "/login"
    case "inactive":
      return "/deactivated"
    case "member":
      return "/"
    case "orgless":
    case "profile_missing":
    case "profile_error":
      return null
  }
}
