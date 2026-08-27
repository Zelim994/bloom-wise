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
  new: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
  in_progress: "bg-[var(--warn-bg)] text-[var(--warn-text)]",
  ready: "bg-[var(--sage-bg)] text-[var(--sage-text)]",
  delivered: "bg-[var(--sage-bg)] text-[var(--sage-text)]",
  cancelled: "bg-[var(--brand-accent-bg)] text-[var(--brand-accent-text)]",
}

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Не оплачен",
  partial: "Частично",
  paid: "Оплачен",
}

const PAYMENT_CLS: Record<string, string> = {
  unpaid: "bg-[var(--brand-accent-bg)] text-[var(--brand-accent-text)]",
  partial: "bg-[var(--warn-bg)] text-[var(--warn-text)]",
  paid: "bg-[var(--sage-bg)] text-[var(--sage-text)]",
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
          className="inline-flex items-center gap-1.5 min-h-9 px-2 rounded-md text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Клиенты
        </Link>
        <Link
          href={`/orders/new?customer_id=${customer.id}`}
          className="flex items-center gap-1.5 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-hover)] text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          Новый заказ
        </Link>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4 space-y-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-heading)]">{customer.full_name}</h1>
          {customer.phone && (
            <div className="flex items-center gap-2 mt-1">
              <Phone className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span className="text-sm text-[var(--text-secondary)]">{customer.phone}</span>
              <a
                href={waHref(customer.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-[var(--sage-text)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
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
                className="flex items-center gap-1 text-sm text-[var(--sage-text)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
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
            <ShoppingBag className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="text-sm text-[var(--text-secondary)]">
              {activeOrders.length} {pluralOrders(activeOrders.length)}
            </span>
          </div>
          {totalSpent > 0 && (
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              ₽{totalSpent.toLocaleString("ru", { maximumFractionDigits: 0 })}
            </div>
          )}
          {customer.avg_check != null && (
            <div className="text-xs text-[var(--text-muted)]">
              Средний чек ₽{customer.avg_check.toLocaleString("ru", { maximumFractionDigits: 0 })}
            </div>
          )}
        </div>

        {/* Comment */}
        {customer.comment && (
          <p className="text-sm text-[var(--text-secondary)] border-t border-[var(--border)] pt-3">{customer.comment}</p>
        )}

        {/* Preferences */}
        {((customer.favorite_flowers && customer.favorite_flowers.length > 0) ||
          (customer.favorite_colors && customer.favorite_colors.length > 0)) && (
          <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-secondary)]">
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
        <h2 className="text-sm font-semibold text-[var(--text-heading)] uppercase tracking-wide">
          История заказов
        </h2>

        {allOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-center">
            <p className="text-sm text-[var(--text-secondary)]">Заказов пока нет</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {allOrders.map((order) => {
              const payLabel = PAYMENT_LABEL[order.payment_status] ?? order.payment_status
              const payCls = PAYMENT_CLS[order.payment_status] ?? "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"

              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 flex-wrap"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-[var(--text-heading)] shrink-0">
                      {order.order_number ?? "—"}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">
                      {fmtDate(order.order_date)}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_CLS[order.status] ?? "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"}`}
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
                      <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                        ₽{order.total_amount.toLocaleString("ru", { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    <Link
                      href={`/orders/${order.id}`}
                      className="inline-flex items-center min-h-9 px-2 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
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
