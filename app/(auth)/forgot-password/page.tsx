"use client"

import { Suspense, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getForgotPasswordErrorMessage } from "@/lib/auth/authReturn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const subscribe = () => () => {}
const clientReady = () => true
const serverReady = () => false

function FormLoadingMessage() {
  return (
    <p role="status" className="text-sm text-zinc-600">
      Загружаем форму. Если она не становится доступной, обновите страницу
      и проверьте, что JavaScript включён.
    </p>
  )
}

function ForgotPasswordContent() {
  // A server-rendered form must not submit as a plain GET before hydration.
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady)
  // Сюда /auth/callback отправляет неудавшуюся ссылку восстановления
  const linkError = getForgotPasswordErrorMessage(useSearchParams().get("error"))
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })
      if (resetError) throw resetError
      // Neutral message: never disclose whether the account exists.
      setSubmitted(true)
    } catch {
      // Only show generic error for technical failures — never reveal email existence
      setError("Не удалось отправить ссылку. Попробуйте позже.")
    } finally {
      setLoading(false)
    }
  }

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
          <p className="text-sm text-zinc-500 mt-1">Восстановление пароля</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {submitted ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
                <p className="text-sm text-emerald-700 leading-relaxed">
                  Если такой email зарегистрирован, мы отправили ссылку для восстановления пароля.
                </p>
              </div>
              <p className="text-xs text-zinc-400 text-center leading-relaxed">
                Проверьте папку «Спам», если письмо не пришло в течение нескольких минут.
              </p>
              <Link
                href="/login"
                className="block text-center text-sm text-rose-500 hover:text-rose-600 font-medium"
              >
                Вернуться ко входу
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!ready && <FormLoadingMessage />}
              {linkError && (
                <div role="alert" className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                  <p className="text-sm text-amber-700">{linkError}</p>
                </div>
              )}
              <p className="text-sm text-zinc-600 leading-relaxed">
                Введите email вашего аккаунта — мы отправим ссылку для сброса пароля.
              </p>

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
                  disabled={!ready || loading}
                  className="h-10 border-zinc-200"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <Button
                type="submit"
                disabled={!ready || loading}
                className="w-full h-10 bg-rose-500 hover:bg-rose-600 text-white font-medium"
              >
                {loading ? "Отправляем..." : "Отправить ссылку"}
              </Button>

              <p className="mt-4 text-center text-sm text-zinc-500">
                <Link href="/login" className="text-rose-500 hover:text-rose-600 font-medium">
                  Назад ко входу
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#f8f8fa] px-4">
        <div className="w-full max-w-sm"><FormLoadingMessage /></div>
      </div>
    }>
      <ForgotPasswordContent />
    </Suspense>
  )
}
