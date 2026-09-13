import { createClient } from "@/lib/supabase/server"
import { getSafeNext } from "@/lib/auth/next"
import { getCallbackFailureRedirect } from "@/lib/auth/authReturn"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Редирект с относительным Location (RFC 9110 допускает URI-reference).
 *
 * request.url внутри Next может нести внутренний origin (например, localhost
 * за прокси или в dev при заходе на 127.0.0.1), а auth-cookie только что
 * записаны для публичного хоста браузера. Относительный путь браузер
 * разрешает от URL, который открыл он сам, — хост не меняется, и заголовкам
 * Host/X-Forwarded-Host доверять не нужно. NextResponse.redirect здесь не
 * подходит: он принимает только абсолютные URL. Cookie из cookies() Next
 * дописывает к возвращённому ответу сам.
 *
 * `path` обязан быть уже проверенным внутренним путём (getSafeNext или
 * getCallbackFailureRedirect). `fallback` — константа на случай, если после
 * сериализации путь перестал быть однозначно внутренним.
 */
function redirectToInternalPath(path: string, fallback: string) {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: serializeInternalPath(path) ?? fallback },
  })
}

// Фиксированная база только для сериализации; к хосту запроса отношения не имеет
const SERIALIZATION_BASE = "https://bloomwise.invalid"

/**
 * Приводит проверенный путь к ASCII-форме, пригодной для заголовка:
 * getSafeNext пропускает Unicode (например, ?name=Салон), а Headers
 * принимает только ByteString. URL percent-кодирует только то, что нужно,
 * существующие %XX не трогает и канонизирует dot-сегменты.
 *
 * Канонизация может превратить принятое значение в network-path:
 * "/safe/..//evil.example" даёт pathname "//evil.example", который браузер
 * прочтёт как внешний хост. Такой результат отвергается — null.
 */
function serializeInternalPath(path: string): string | null {
  let url: URL
  try {
    url = new URL(path, SERIALIZATION_BASE)
  } catch {
    return null
  }
  if (url.origin !== SERIALIZATION_BASE) return null

  const serialized = `${url.pathname}${url.search}${url.hash}`
  if (!serialized.startsWith("/") || serialized.startsWith("//") || serialized.startsWith("/\\")) {
    return null
  }
  return serialized
}

// Только обмен кода на сессию и безопасный редирект. Организацию не создаём:
// обычная регистрация приходит сюда с next=/onboarding, приглашение — с
// next=/invite/<token>, восстановление пароля — с next=/reset-password.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const rawNext = searchParams.get("next")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return redirectToInternalPath(getSafeNext(rawNext) ?? "/", "/")
    }
  }

  // Код отсутствует, устарел, уже использован или открыт в другом браузере:
  // сохраняем безопасный контекст (приглашение/онбординг) и показываем причину
  return redirectToInternalPath(getCallbackFailureRedirect(rawNext), "/login?error=auth")
}
