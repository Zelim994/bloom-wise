import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, MessageCircle, Phone, ShoppingBag, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"

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

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Не оплачен",
  partial: "Частично",
  paid: "Оплачен",
}

const PAYMENT_CLS: Record<string, string> = {
  unpaid: "bg-red-100 text-red-500",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("ru", { day: "2-digit", month: "long", year: "numeric" })
}

function waHref(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}`
}

function pluralOrders(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "заказ"
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "заказа"
  return "заказов"
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from("customers")
    .select("id, full_name, phone, whatsapp, avg_check, comment, created_at, favorite_flowers, favorite_colors")
    .eq("id", id)
    .maybeSingle()

  if (!customer) notFound()

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, total_amount, order_date, status, payment_status, ready_at")
    .eq("customer_id", id)
    .order("order_date", { ascending: false })

  const allOrders = orders ?? []
  const activeOrders = allOrders.filter((o) => o.status !== "cancelled")
  const totalSpent = activeOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0)
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back + action */}
      <div className="flex items-center justify-between">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Клиенты
        </Link>
        <Link
          href={`/orders/new?customer_id=${customer.id}`}
          className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Новый заказ
        </Link>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4 space-y-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">{customer.full_name}</h1>
          {customer.phone && (
            <div className="flex items-center gap-2 mt-1">
              <Phone className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-sm text-zinc-600">{customer.phone}</span>
              <a
                href={waHref(customer.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            </div>
          )}
          {!customer.phone && customer.whatsapp && (
            <div className="flex items-center gap-2 mt-1">
              <a
                href={waHref(customer.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                {customer.whatsapp}
              </a>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 pt-1 flex-wrap">
          <div className="flex items-center gap-1.5">
            <ShoppingBag className="h-4 w-4 text-zinc-300" />
            <span className="text-sm text-zinc-500">
              {activeOrders.length} {pluralOrders(activeOrders.length)}
            </span>
          </div>
          {totalSpent > 0 && (
            <div className="text-sm font-semibold text-zinc-800">
              ₽{totalSpent.toLocaleString("ru", { maximumFractionDigits: 0 })}
            </div>
          )}
          {customer.avg_check != null && (
            <div className="text-xs text-zinc-400">
              Средний чек ₽{customer.avg_check.toLocaleString("ru", { maximumFractionDigits: 0 })}
            </div>
          )}
        </div>

        {/* Comment */}
        {customer.comment && (
          <p className="text-sm text-zinc-500 border-t border-zinc-100 pt-3">{customer.comment}</p>
        )}

        {/* Preferences */}
        {((customer.favorite_flowers && customer.favorite_flowers.length > 0) ||
          (customer.favorite_colors && customer.favorite_colors.length > 0)) && (
          <div className="flex flex-wrap gap-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            {customer.favorite_flowers && customer.favorite_flowers.length > 0 && (
              <span>Любимые цветы: {customer.favorite_flowers.join(", ")}</span>
            )}
            {customer.favorite_colors && customer.favorite_colors.length > 0 && (
              <span>Любимые цвета: {customer.favorite_colors.join(", ")}</span>
            )}
          </div>
        )}
      </div>

      {/* Orders */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          История заказов
        </h2>

        {allOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-zinc-200 bg-white text-center">
            <p className="text-sm text-zinc-400">Заказов пока нет</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {allOrders.map((order) => {
              const payLabel = PAYMENT_LABEL[order.payment_status] ?? order.payment_status
              const payCls = PAYMENT_CLS[order.payment_status] ?? "bg-zinc-100 text-zinc-400"

              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 flex-wrap"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-zinc-800 shrink-0">
                      {order.order_number ?? "—"}
                    </span>
                    <span className="text-xs text-zinc-400 shrink-0">
                      {fmtDate(order.order_date)}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_CLS[order.status] ?? "bg-zinc-100 text-zinc-400"}`}
                    >
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${payCls}`}
                    >
                      {payLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {order.total_amount != null && (
                      <span className="text-sm font-semibold text-zinc-800 tabular-nums">
                        ₽{order.total_amount.toLocaleString("ru", { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-xs text-zinc-400 hover:text-rose-500 transition-colors"
                    >
                      Открыть →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
