"use client"

import { useState } from "react"
import Link from "next/link"
import { Search, MessageCircle, Users, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"

export type CustomerOrder = {
  id: string
  order_number: string | null
  total_amount: number | null
  order_date: string
  status: string
}

export type CustomerWithOrders = {
  id: string
  full_name: string
  phone: string | null
  whatsapp: string | null
  avg_check: number | null
  comment: string | null
  created_at: string
  orders: CustomerOrder[]
}

const STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  in_progress: "В работе",
  ready: "Готов",
  delivered: "Выдан",
  cancelled: "Отменён",
}

const STATUS_CLS: Record<string, string> = {
  new: "bg-blue-100 text-blue-600",
  in_progress: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  delivered: "bg-zinc-100 text-zinc-500",
  cancelled: "bg-red-100 text-red-500",
}

function pluralOrders(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "заказ"
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "заказа"
  return "заказов"
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function waHref(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}`
}

export function CustomersListClient({ customers }: { customers: CustomerWithOrders[] }) {
  const [nameQ, setNameQ] = useState("")
  const [phoneQ, setPhoneQ] = useState("")

  const filtered = customers.filter((c) => {
    const matchName =
      !nameQ.trim() || c.full_name.toLowerCase().includes(nameQ.trim().toLowerCase())
    const matchPhone =
      !phoneQ.trim() || (c.phone ?? "").replace(/\D/g, "").includes(phoneQ.trim().replace(/\D/g, ""))
    return matchName && matchPhone
  })

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <Input
            placeholder="Поиск по имени"
            value={nameQ}
            onChange={(e) => setNameQ(e.target.value)}
            className="pl-9 border-zinc-200 h-9 text-sm"
          />
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <Input
            placeholder="Поиск по телефону"
            value={phoneQ}
            onChange={(e) => setPhoneQ(e.target.value)}
            className="pl-9 border-zinc-200 h-9 text-sm"
          />
        </div>
      </div>

      {/* Empty */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-zinc-200 bg-white text-center">
          <Users className="h-8 w-8 text-zinc-200 mb-2" />
          <p className="text-sm text-zinc-400">
            {customers.length === 0
              ? "Клиентов пока нет. Они появятся при оформлении заказов."
              : "Клиенты не найдены"}
          </p>
        </div>
      )}

      {/* List */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((c) => {
            const activeOrders = c.orders.filter((o) => o.status !== "cancelled")
            const count = activeOrders.length
            const total = activeOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0)
            const lastOrder = [...activeOrders].sort((a, b) =>
              b.order_date.localeCompare(a.order_date)
            )[0]

            return (
              <div
                key={c.id}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="font-semibold text-zinc-900 text-sm">{c.full_name}</div>

                    {c.phone && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-500">{c.phone}</span>
                        <a
                          href={waHref(c.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-500 hover:text-emerald-600 transition-colors"
                          title="Написать в WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap pt-0.5">
                      <span>
                        {count} {pluralOrders(count)}
                      </span>
                      {count > 0 && (
                        <span className="font-semibold text-zinc-700">
                          ₽{total.toLocaleString("ru", { maximumFractionDigits: 0 })}
                        </span>
                      )}
                      {lastOrder && (
                        <>
                          <span className="text-zinc-200">·</span>
                          <span>Последний: {fmtDate(lastOrder.order_date)}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CLS[lastOrder.status] ?? "bg-zinc-100 text-zinc-400"}`}
                          >
                            {STATUS_LABEL[lastOrder.status] ?? lastOrder.status}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Link
                      href={`/orders/new?customer_id=${c.id}`}
                      className="flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-600 transition-colors whitespace-nowrap"
                    >
                      <Plus className="h-3 w-3" />
                      Новый заказ
                    </Link>
                    <Link
                      href={`/customers/${c.id}`}
                      className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors whitespace-nowrap"
                    >
                      Открыть →
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
