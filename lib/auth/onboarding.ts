// Маршруты входа в приложение после аутентификации (CORE-READY-G2-B2).
//
// Организация создаётся ровно в одном месте — явной отправкой формы на
// /onboarding. Поэтому login, register и /auth/callback только решают, КУДА
// отправить пользователя, и ничего не пишут. Эти функции — единственный
// источник таких решений для клиентских страниц, где рендер не тестируется.

export const ONBOARDING_PATH = "/onboarding"

/** Верхняя граница длины названия — защита ввода, а не продуктовое правило. */
export const ORGANIZATION_NAME_MAX_LENGTH = 100

/** `safeNext` должен быть уже проверен через getSafeNext. */
export function isInvitePath(safeNext: string | null): safeNext is string {
  return safeNext?.startsWith("/invite/") === true
}

/**
 * Куда вернёт письмо подтверждения. Приглашение сохраняет свою ссылку, обычная
 * регистрация всегда ведёт на онбординг — тот же адрес, что и при отключённом
 * подтверждении (getPostSignupDestination).
 */
export function getSignupEmailRedirectTo(origin: string, safeNext: string | null): string {
  const next = isInvitePath(safeNext) ? safeNext : ONBOARDING_PATH
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`
}

/** Куда перейти сразу после signUp, если сессия выдана без подтверждения email. */
export function getPostSignupDestination(safeNext: string | null): string {
  return isInvitePath(safeNext) ? safeNext : ONBOARDING_PATH
}

/**
 * Куда перейти после входа. Отсутствие организации решает DashboardLayout
 * (редирект на онбординг), поэтому login не читает профиль.
 */
export function getPostLoginDestination(safeNext: string | null): string {
  return safeNext || "/"
}

export type OrganizationNameResult =
  | { ok: true; name: string }
  | { ok: false; error: string }

export function normalizeOrganizationName(raw: unknown): OrganizationNameResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Укажите название салона" }
  }
  const name = raw.trim()
  if (!name) {
    return { ok: false, error: "Укажите название салона" }
  }
  if (name.length > ORGANIZATION_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Название должно быть не длиннее ${ORGANIZATION_NAME_MAX_LENGTH} символов`,
    }
  }
  return { ok: true, name }
}
