"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function ForgotPasswordContent() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    setLoading(false)

    if (resetError) {
      // Only show generic error for technical failures — never reveal email existence
      setError("Не удалось отправить ссылку. Попробуйте позже.")
      return
    }

    // Always show neutral message — do not reveal whether the email exists
    setSubmitted(true)
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
                  className="h-10 border-zinc-200"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
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
    <Suspense fallback={null}>
      <ForgotPasswordContent />
    </Suspense>
  )
}
