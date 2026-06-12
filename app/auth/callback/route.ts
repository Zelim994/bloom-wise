import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (data.user) {
        const salonName =
          (data.user.user_metadata?.salon_name as string | undefined) ?? "Мой салон"
        const { error: rpcError } = await supabase.rpc("create_my_organization", {
          p_org_name: salonName,
        })
        if (rpcError) {
          console.error("[auth/callback] create_my_organization:", rpcError.message)
        }
      }

      // Prevent open redirect: only allow same-origin relative paths
      const safeNext =
        next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
          ? next
          : "/"
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
  }

  // Неверный или просроченный код — на логин с пометкой
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
