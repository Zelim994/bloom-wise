"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail } from "lucide-react"

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [salonName, setSalonName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const supabase = createClient()

    // 1. Регистрируем пользователя, сохраняем название салона в metadata
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: "owner",
          salon_name: salonName,
        },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // 2. Если нет сессии — Supabase отправил письмо для подтверждения
    if (!authData.session) {
      setEmailSent(true)
      setLoading(false)
      return
    }

    // 3. Сессия есть (подтверждение отключено) — сразу создаём организацию
    if (authData.user) {
      await supabase.rpc("create_my_organization", { p_org_name: salonName })
    }

    router.push("/")
    router.refresh()
  }

  // Экран "Проверьте почту"
  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f8fa]">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
                <Mail className="h-7 w-7 text-rose-500" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">
              Подтвердите email
            </h2>
            <p className="text-sm text-zinc-500 mb-1">
              Мы отправили письмо на
            </p>
            <p className="text-sm font-medium text-zinc-800 mb-4">{email}</p>
            <p className="text-xs text-zinc-400 mb-6">
              Перейдите по ссылке в письме — после этого вы сможете войти в BloomWise.
            </p>
            <Link href="/login">
              <Button
                variant="outline"
                className="w-full border-zinc-200 text-zinc-700"
              >
                Перейти ко входу
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
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
          <p className="text-sm text-zinc-500 mt-1">Создай аккаунт для своего салона</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="salonName" className="text-sm font-medium text-zinc-700">
                Название салона
              </Label>
              <Input
                id="salonName"
                placeholder="Цветочный рай"
                value={salonName}
                onChange={(e) => setSalonName(e.target.value)}
                required
                className="h-10 border-zinc-200"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-sm font-medium text-zinc-700">
                Ваше имя
              </Label>
              <Input
                id="fullName"
                placeholder="Анна Иванова"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="h-10 border-zinc-200"
              />
            </div>

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
              <Label htmlFor="password" className="text-sm font-medium text-zinc-700">
                Пароль
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Минимум 6 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
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
              {loading ? "Создаём аккаунт..." : "Зарегистрироваться"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-zinc-500">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-rose-500 hover:text-rose-600 font-medium">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

