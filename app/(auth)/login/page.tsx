"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { getSafeNext } from "@/lib/auth/next"
import { getPostLoginDestination, isInvitePath } from "@/lib/auth/onboarding"
import { getLoginErrorMessage } from "@/lib/auth/authReturn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawNext = searchParams.get("next")
  const safeNext = getSafeNext(rawNext)
  const isInviteFlow = isInvitePath(safeNext)
  const resetSuccess = searchParams.get("reset") === "success"
  const linkError = getLoginErrorMessage(searchParams.get("error"))

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const supabase = createClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError("Неверный email или пароль")
      setLoading(false)
      return
    }

    // Только вход и редирект: без организации DashboardLayout отправит на /onboarding
    router.push(getPostLoginDestination(safeNext))
    router.refresh()
  }

  const registerHref = safeNext
    ? `/register?next=${encodeURIComponent(safeNext)}`
    : "/register"

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f8fa]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500">
              <span className="text-xl">🌸</span>
            </div>
          </div>
          <h1 className="text-xl font-bold text-zinc-900">BloomWise</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {isInviteFlow ? "Войдите, чтобы принять приглашение" : "Войди в рабочий центр"}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {resetSuccess && (
            <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
              <p className="text-sm text-emerald-700">Пароль изменён. Войдите с новым паролем.</p>
            </div>
          )}
          {linkError && (
            <div role="alert" className="mb-4 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
              <p className="text-sm text-amber-700">{linkError}</p>
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-zinc-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="florist@salon.ru"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 border-zinc-200"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-zinc-700">
                  Пароль
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-zinc-400 hover:text-rose-500 transition-colors"
                >
                  Забыли пароль?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 border-zinc-200"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-rose-500 hover:bg-rose-600 text-white font-medium"
            >
              {loading ? "Входим..." : "Войти"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-zinc-500">
            Нет аккаунта?{" "}
            <Link href={registerHref} className="text-rose-500 hover:text-rose-600 font-medium">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
