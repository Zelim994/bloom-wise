import { createClient } from "@/lib/supabase/server"
import { getSafeNext } from "@/lib/auth/next"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Только обмен кода на сессию и безопасный редирект. Организацию не создаём:
// обычная регистрация приходит сюда с next=/onboarding, приглашение — с
// next=/invite/<token>, восстановление пароля — с next=/reset-password.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const rawNext = searchParams.get("next")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const safeNext = getSafeNext(rawNext) ?? "/"
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
  }

  // Неверный или просроченный код — на логин с пометкой
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
