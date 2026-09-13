import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getAuthenticatedAuthRouteRedirect } from "@/lib/auth/authReturn"

/**
 * Редирект, не теряющий обновлённую сессию: getUser() мог записать новые
 * auth-cookie в supabaseResponse, а NextResponse.redirect создаёт новый ответ.
 */
function redirectWithSession(url: URL, sessionResponse: NextResponse) {
  const response = NextResponse.redirect(url)
  sessionResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  return response
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Пути, доступные без авторизации
  const isPublicPath =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/invite/") ||
    pathname.startsWith("/auth/callback")

  // Пути, куда авторизованный пользователь не должен попадать
  const isAuthOnlyPath =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register")

  // Не авторизован → на /login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return redirectWithSession(url, supabaseResponse)
  }

  // Уже авторизован → с /login или /register на безопасный next (например,
  // приглашение), иначе на главную. Цели-auth-маршруты отвергаются: цикл.
  if (user && isAuthOnlyPath) {
    const destination = getAuthenticatedAuthRouteRedirect(
      request.nextUrl.searchParams.get("next")
    )
    return redirectWithSession(new URL(destination, request.nextUrl.origin), supabaseResponse)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
