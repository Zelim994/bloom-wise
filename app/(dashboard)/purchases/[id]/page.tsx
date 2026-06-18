import { redirect } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Truck, ExternalLink, Package, Plus,
  Calendar, Building2, Layers, ReceiptText, ArrowRightLeft,
} from "lucide-react"
import {
  getPurchaseDetail,
  getPurchaseBatches,
  getPurchaseMovements,
} from "@/app/actions/purchases"

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ru", {
    day: "numeric", month: "long", year: "numeric",
  })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

function daysAgo(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr + "T00:00:00").getTime()) / 86_400_000)
}

const FRESHNESS_CFG: Record<string, { label: string; cls: string }> = {
  fresh:    { label: "Свежая",    cls: "bg-emerald-100 text-emerald-700" },
  aging:    { label: "Залежалась", cls: "bg-orange-100 text-orange-700"  },
  critical: { label: "Критично",  cls: "bg-red-100 text-red-600"         },
  expired:  { label: "Просрочена",cls: "bg-red-100 text-red-600"         },
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [detail, batches, movements] = await Promise.all([
    getPurchaseDetail(id),
    getPurchaseBatches(id),
    getPurchaseMovements(id),
  ])

  if (!detail) redirect("/purchases")

  // ── derived stats ──────────────────────────────────────────────────────────
  const totalGoods    = detail.items.reduce((s, i) => s + i.quantity * i.cost_price, 0)
  const totalDelivery = detail.items.reduce((s, i) => s + (i.extra_costs ?? 0), 0)
  const totalItems    = detail.items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="max-w-3xl space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/purchases"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-zinc-900 leading-tight">
            Поставка от {fmtDate(detail.purchase_date)}
          </h1>
          {detail.comment && (
            <p className="text-xs text-zinc-400 mt-0.5">{detail.comment}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/purchases/new"
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Новая поставка
          </Link>
          <Link
            href="/purchases"
            className="flex items-center gap-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Truck className="h-3.5 w-3.5" />
            Все поставки
          </Link>
        </div>
      </div>

      {/* ── Block 1: info cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Поставщик */}
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 space-y-0.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Building2 className="h-3.5 w-3.5 text-zinc-400" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Поставщик</p>
          </div>
          <p className="text-sm font-semibold text-zinc-800 leading-snug">
            {detail.suppliers?.name ?? <span className="text-zinc-400 font-normal italic">Не указан</span>}
          </p>
          {detail.suppliers?.phone && (
            <p className="text-xs text-zinc-400">{detail.suppliers.phone}</p>
          )}
        </div>

        {/* Дата */}
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Дата</p>
          </div>
          <p className="text-sm font-semibold text-zinc-800">{fmtDate(detail.purchase_date)}</p>
        </div>

        {/* Сумма */}
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <ReceiptText className="h-3.5 w-3.5 text-zinc-400" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Сумма</p>
          </div>
          <p className="text-lg font-bold text-zinc-900 tabular-nums">
            ₽{totalGoods.toLocaleString("ru", { maximumFractionDigits: 0 })}
          </p>
          {totalDelivery > 0 && (
            <p className="text-xs text-blue-500 mt-0.5">
              +₽{totalDelivery.toLocaleString("ru", { maximumFractionDigits: 0 })} доставка
            </p>
          )}
        </div>

        {/* Позиций */}
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Layers className="h-3.5 w-3.5 text-zinc-400" />
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Позиций</p>
          </div>
          <p className="text-lg font-bold text-zinc-900 tabular-nums">{detail.items.length}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{totalItems} шт всего</p>
        </div>
      </div>

      {/* ── Block 2: состав поставки ────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
          <Truck className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-800">Состав поставки</h2>
          <span className="ml-auto text-xs text-zinc-400">{detail.items.length} позиций</span>
        </div>

        {detail.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-8 w-8 text-zinc-200 mb-2" />
            <p className="text-sm text-zinc-400">Нет позиций</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Товар</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Кол-во</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Цена</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Сумма</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {detail.items.map((item) => {
                  const lineTotal = item.quantity * item.cost_price
                  return (
                    <tr key={item.id} className="hover:bg-zinc-50/60 transition-colors group">
                      <td className="px-5 py-3">
                        <p className="font-medium text-zinc-800">{item.flowers?.name ?? "—"}</p>
                        {item.flowers?.category && (
                          <p className="text-xs text-zinc-400 mt-0.5">{item.flowers.category}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-zinc-800 tabular-nums whitespace-nowrap">
                        {item.quantity}
                        <span className="text-xs font-normal text-zinc-400 ml-1">
                          {item.flowers?.unit ?? "шт"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-zinc-600 tabular-nums">
                        ₽{item.cost_price.toLocaleString("ru", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-zinc-800 tabular-nums">
                        ₽{lineTotal.toLocaleString("ru", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-3 py-3">
                        {item.flower_id && (
                          <Link
                            href={`/inventory/${item.flower_id}`}
                            title="Открыть карточку склада"
                            className="flex items-center justify-center h-7 w-7 rounded-lg border border-zinc-200 text-zinc-400 hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 bg-zinc-50">
                  <td className="px-5 py-3 text-sm font-semibold text-zinc-700">Итого</td>
                  <td className="px-5 py-3 text-right font-semibold text-zinc-600 tabular-nums">
                    {totalItems} шт
                  </td>
                  <td />
                  <td className="px-5 py-3 text-right">
                    <span className="text-base font-bold text-zinc-900 tabular-nums">
                      ₽{totalGoods.toLocaleString("ru", { maximumFractionDigits: 0 })}
                    </span>
                    {totalDelivery > 0 && (
                      <p className="text-xs text-blue-500 mt-0.5">
                        +₽{totalDelivery.toLocaleString("ru", { maximumFractionDigits: 0 })} доставка
                      </p>
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Block 3: партии на складе ───────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
          <Package className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-800">Партии на складе</h2>
          <span className="ml-auto text-xs text-zinc-400">{batches.length} партий</span>
        </div>

        {batches.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-zinc-400">Партии склада созданы при оформлении поставки</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/60">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Товар</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Остаток</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Закупочная</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Дней</th>
                  <th className="px-5 py-2.5 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wide">Статус</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {batches.map((b) => {
                  const days = daysAgo(b.arrived_at)
                  const statusKey = b.freshness_status ?? (days >= 7 ? "aging" : "fresh")
                  const cfg = FRESHNESS_CFG[statusKey] ?? FRESHNESS_CFG.fresh
                  return (
                    <tr key={b.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-zinc-800">{b.flowers?.name ?? "—"}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{fmtDate(b.arrived_at)}</p>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span className="font-semibold text-zinc-800">{b.quantity_remaining}</span>
                        <span className="text-xs text-zinc-400 ml-1">
                          / {b.quantity_in} {b.flowers?.unit ?? "шт"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-zinc-600 tabular-nums">
                        ₽{b.cost_price.toLocaleString("ru", { maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-5 py-3 text-right tabular-nums font-medium ${
                        days >= 7 ? "text-orange-600" : "text-zinc-500"
                      }`}>
                        {days}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/inventory/${b.flower_id}`}
                          title="Открыть карточку склада"
                          className="flex items-center justify-center h-7 w-7 rounded-lg border border-zinc-200 text-zinc-400 hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Block 4: движения склада ────────────────────────────────────────── */}
      {movements.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-800">Движения склада</h2>
            <span className="ml-auto text-xs text-zinc-400">{movements.length} записей</span>
          </div>
          <div className="divide-y divide-zinc-50">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{m.flowers?.name ?? "—"}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {m.created_at ? fmtDateTime(m.created_at) : "—"}
                    {m.comment ? ` · ${m.comment}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-emerald-600 shrink-0">
                  +{m.quantity}
                  <span className="text-xs font-normal text-zinc-400 ml-1">
                    {m.flowers?.unit ?? "шт"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
