// Возврат пользователя из auth-ссылок и с auth-страниц (G2-B2 rollout).
//
// Опирается на getSafeNext и не ослабляет его: сюда попадает только уже
// принятое внутреннее значение, которое дополнительно отсекается от целей,
// возвращающих пользователя обратно в auth-маршруты (цикл редиректов или
// потерянный контекст).

import { getSafeNext } from "@/lib/auth/next"

const PARSER_BASE = "https://bloomwise.invalid"

/** C0-управляющие символы и DEL — тот же диапазон, что в lib/auth/next.ts. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/** Маршруты, которые при повторном заходе снова уводят на логин или «/». */
const AUTH_LOOP_PREFIXES = ["/login", "/register", "/auth/callback"]

export const RESET_PASSWORD_PATH = "/reset-password"
export const LOGIN_AUTH_ERROR = "auth"
export const RECOVERY_LINK_ERROR = "recovery_link"

/**
 * Путь после той же нормализации, что делает браузер/роутер: dot-сегменты,
 * percent-encoding, регистр. null — значение нельзя однозначно разобрать,
 * вызывающий трактует это как небезопасное.
 */
function normalizedPathname(safeNext: string): string | null {
  try {
    const decoded = decodeURIComponent(new URL(safeNext, PARSER_BASE).pathname)
    // Декодирование могло проявить скрытые "//", обратный слэш или управляющие символы
    if (decoded.includes("//") || decoded.includes("\\") || hasControlChars(decoded)) {
      return null
    }
    const resolved = new URL(decoded, PARSER_BASE)
    if (resolved.origin !== PARSER_BASE) return null
    return resolved.pathname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Безопасная внутренняя цель, не ведущая обратно в auth-маршрут.
 * null — цели нет или она отвергнута.
 */
export function getSafeReturnTarget(rawNext: string | null | undefined): string | null {
  const safeNext = getSafeNext(rawNext)
  if (!safeNext) return null

  const pathname = normalizedPathname(safeNext)
  if (!pathname) return null

  const loops = AUTH_LOOP_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  return loops ? null : safeNext
}

/**
 * Куда /auth/callback отправляет при неудаче: код отсутствует, устарел, уже
 * использован или открыт в другом браузере (нет PKCE code verifier).
 * Приглашение и онбординг сохраняются через next, восстановление пароля
 * уходит на запрос новой ссылки. Подтверждённость email здесь не утверждается.
 */
export function getCallbackFailureRedirect(rawNext: string | null | undefined): string {
  const target = getSafeReturnTarget(rawNext)
  if (!target) return `/login?error=${LOGIN_AUTH_ERROR}`

  if (normalizedPathname(target) === RESET_PASSWORD_PATH) {
    return `/forgot-password?error=${RECOVERY_LINK_ERROR}`
  }

  return `/login?error=${LOGIN_AUTH_ERROR}&next=${encodeURIComponent(target)}`
}

/**
 * Куда proxy отправляет уже авторизованного пользователя с /login или
 * /register: на безопасную цель из next (например, приглашение), иначе «/».
 */
export function getAuthenticatedAuthRouteRedirect(rawNext: string | null | undefined): string {
  return getSafeReturnTarget(rawNext) ?? "/"
}

export function getLoginErrorMessage(code: string | null): string | null {
  if (code !== LOGIN_AUTH_ERROR) return null
  return "Ссылка из письма не сработала: она устарела, уже была использована или открыта в другом браузере. Если вы уже подтвердили email, просто войдите с паролем."
}

export function getForgotPasswordErrorMessage(code: string | null): string | null {
  if (code !== RECOVERY_LINK_ERROR) return null
  return "Ссылка для сброса пароля не сработала: она устарела, уже была использована или открыта в другом браузере. Запросите новую ссылку и откройте её в том же браузере."
}
