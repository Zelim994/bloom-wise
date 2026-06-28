"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Input } from "@/components/ui/input"
import { createCustomer } from "@/app/actions/customers"

export default function NewCustomerPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [comment, setComment] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingId, setExistingId] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setExistingId(null)

    const result = await createCustomer({ full_name: fullName, phone, comment })

    if ("error" in result) {
      setError(result.error)
      setExistingId(result.existingId ?? null)
      setLoading(false)
      return
    }

    router.push(`/customers/${result.id}`)
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Клиенты
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Новый клиент</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Добавьте клиента, чтобы потом быстро создавать заказы.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-200 bg-white px-5 py-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-700">
            Имя клиента <span className="text-rose-500">*</span>
          </label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Анна Иванова"
            className="border-zinc-200 h-9 text-sm"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-700">Телефон</label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 900 000 00 00"
            type="tel"
            className="border-zinc-200 h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-700">Комментарий</label>
          <textarea
            value={comment}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)}
            placeholder="Предпочтения, заметки..."
            rows={3}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 resize-none"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 space-y-1">
            <p>{error}</p>
            {existingId && (
              <Link
                href={`/customers/${existingId}`}
                className="font-medium underline hover:text-red-800"
              >
                Открыть клиента →
              </Link>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? "Сохранение..." : "Создать клиента"}
          </button>
          <Link
            href="/customers"
            className="flex-1 text-center bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  )
}
