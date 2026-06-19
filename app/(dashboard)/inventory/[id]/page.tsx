import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Package, ShoppingCart, ShoppingBag } from "lucide-react"
import {
  getFlowerById,
  getFlowerInventoryItems,
  getFlowerMovements,
  getFlowerActivityLogs,
} from "@/app/actions/inventory"
import { FlowerInfoEditor } from "@/components/stock/FlowerInfoEditor"
import type { HistoryLog } from "@/components/stock/FlowerInfoEditor"

// ─── helpers ─────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr + "T00:00:00").getTime()) / 86_400_000
  )
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ru", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ─── config ───────────────────────────────────────────────────────────────────

const MOVEMENT_META: Record<string, { label: string; cls: string }> = {
  purchase:           { label: "Закупка",           cls: "text-emerald-600" },
  sale:               { label: "Продажа / заказ",   cls: "text-blue-600"   },
  sale_return:        { label: "Возврат по заказу",  cls: "text-orange-600" },
  writeoff:           { label: "Списание",           cls: "text-red-600"    },
  return:             { label: "Возврат",            cls: "text-orange-600" },
  adjustment:         { label: "Корректировка",      cls: "text-zinc-600"   },
  bouquet_reserved:   { label: "Резерв",             cls: "text-purple-600" },
  bouquet_unreserved: { label: "Снят резерв",        cls: "text-zinc-400"   },
}

const AGING_DAYS = 7

// ─── page ────────────────────────────────────────────────────────────────────

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [flower, batches, movements, rawLogs] = await Promise.all([
    getFlowerById(id),
    getFlowerInventoryItems(id),
    getFlowerMovements(id),
    getFlowerActivityLogs(id),
  ])

  const historyLogs: HistoryLog[] = rawLogs.map((l) => ({
    ...l,
    changes: Array.isArray(l.changes) ? (l.changes as HistoryLog["changes"]) : null,
  }))

  if (!flower) redirect("/inventory")

  // ─── derived stats ──────────────────────────────────────────────────────────
  const minStock = flower.min_stock ?? 0
  const totalBatchStock = batches.reduce((s, b) => s + b.quantity_remaining, 0)

  const avgCostPrice =
    batches.length > 0
      ? batches.reduce((s, b) => s + b.cost_price * b.quantity_remaining, 0) /
        Math.max(totalBatchStock, 1)
      : null

  const oldestBatch = batches[0] ?? null // already FIFO sorted ASC

  const stockStatus: "no_stock" | "low" | "ok" =
    flower.current_stock <= 0
      ? "no_stock"
      : minStock > 0 && flower.current_stock <= minStock
      ? "low"
      : "ok"

  const stockStatusCfg = {
    no_stock: { label: "Нет в наличии", cls: "text-red-600"    },
    low:      { label: "Мало",          cls: "text-amber-600"  },
    ok:       { label: "В норме",       cls: "text-emerald-600"},
  }[stockStatus]

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">{flower.name}</h1>
            <p className="text-sm text-zinc-400">Складская карточка позиции</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/purchases/new"
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Оформить закупку
          </Link>
          <Link
            href="/purchases"
            className="flex items-center gap-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Все поставки
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold mb-1">Остаток</p>
          <p className={`text-2xl font-bold tabular-nums ${stockStatusCfg.cls}`}>
            {flower.current_stock}
            <span className="text-sm font-normal ml-1 text-zinc-400">{flower.unit}</span>
          </p>
          <p className={`text-xs mt-1 font-medium ${stockStatusCfg.cls}`}>{stockStatusCfg.label}</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold mb-1">Партии</p>
          <p className="text-2xl font-bold text-zinc-800 tabular-nums">{batches.length}</p>
          <p className="text-xs mt-1 text-zinc-400">активных</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold mb-1">Ср. закупочная</p>
          <p className="text-2xl font-bold text-zinc-800 tabular-nums">
            {avgCostPrice != null
              ? `₽${avgCostPrice.toLocaleString("ru", { maximumFractionDigits: 0 })}`
              : "—"}
          </p>
          <p className="text-xs mt-1 text-zinc-400">взвешенная</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold mb-1">Старейшая партия</p>
          {oldestBatch ? (
            <>
              <p className="text-base font-bold text-zinc-800 mt-1 leading-tight">
                {fmtDate(oldestBatch.arrived_at)}
              </p>
              <p className={`text-xs mt-1 font-medium ${
                daysAgo(oldestBatch.arrived_at) >= AGING_DAYS ? "text-orange-500" : "text-zinc-400"
              }`}>
                {daysAgo(oldestBatch.arrived_at)} дней назад
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold text-zinc-400 mt-1">—</p>
          )}
        </div>
      </div>

      {/* Block 1: Информация + История изменений (editable) */}
      <FlowerInfoEditor
        flower={{
          id: flower.id,
          name: flower.name,
          category: flower.category,
          sku: flower.sku ?? null,
          unit: flower.unit,
          min_stock: flower.min_stock ?? null,
          sale_price: flower.sale_price ?? null,
          description: flower.description ?? null,
          florist_comment: flower.florist_comment ?? null,
        }}
        historyLogs={historyLogs}
      />

      {/* Block 2: Партии (FIFO) */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">Активные партии</h2>
          <span className="text-xs text-zinc-400">{batches.length} партий · FIFO</span>
        </div>

        {batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Package className="h-8 w-8 text-zinc-200 mb-2" />
            <p className="text-sm text-zinc-500">Нет активных партий</p>
            <Link href="/purchases/new" className="text-sm text-rose-500 hover:underline mt-1">
              Оформить поставку
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/60">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Приход</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Вариант · размер</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden lg:table-cell">Цвет</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Остаток</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Закупочная</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Дней</th>
                <th className="text-center px-5 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden md:table-cell">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {batches.map((b) => {
                const days    = daysAgo(b.arrived_at)
                const isAging = days >= AGING_DAYS
                const vParts  = [b.variety_name, b.variety_size].filter(Boolean)
                const vLabel  = vParts.length > 0 ? vParts.join(" · ") : null

                return (
                  <tr key={b.id} className="hover:bg-zinc-50/50">
                    <td className="px-5 py-3 text-zinc-700 text-sm">
                      {fmtDate(b.arrived_at)}
                      {/* mobile: show variant under date when separate columns are hidden */}
                      {(vLabel || b.color_name) && (
                        <p className="text-xs text-zinc-400 mt-0.5 sm:hidden">
                          {[vLabel, b.color_name].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-600 hidden sm:table-cell">
                      {vLabel
                        ? <span className="font-medium text-zinc-700">{vLabel}</span>
                        : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-600 hidden lg:table-cell">
                      {b.color_name ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-zinc-800 tabular-nums">
                      {b.quantity_remaining}
                      <span className="text-xs font-normal text-zinc-400 ml-1">
                        / {b.quantity_in} {flower.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-600 tabular-nums hidden sm:table-cell">
                      ₽{b.cost_price.toLocaleString("ru", { maximumFractionDigits: 0 })}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium tabular-nums ${
                      isAging ? "text-orange-600" : "text-zinc-500"
                    }`}>
                      {days}
                    </td>
                    <td className="px-5 py-3 text-center hidden md:table-cell">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        isAging
                          ? "bg-orange-100 text-orange-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {isAging ? "Залежалась" : "Свежая"}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Block 3: История движений */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">История движений</h2>
          <span className="text-xs text-zinc-400">{movements.length} записей</span>
        </div>

        {movements.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-400">Движений нет</div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {movements.map((m) => {
              const meta = MOVEMENT_META[m.movement_type] ?? {
                label: m.movement_type,
                cls: "text-zinc-600",
              }
              return (
                <div key={m.id} className="flex items-start justify-between px-5 py-3 gap-4">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${meta.cls}`}>{meta.label}</p>
                    {m.source_type && (
                      <p className="text-xs text-zinc-400 mt-0.5">{m.source_type}</p>
                    )}
                    {m.comment && (
                      <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-xs">{m.comment}</p>
                    )}
                    <p className="text-xs text-zinc-300 mt-0.5">
                      {m.created_at ? fmtDateTime(m.created_at) : "—"}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${
                    m.quantity > 0 ? "text-emerald-600" : "text-red-500"
                  }`}>
                    {m.quantity > 0 ? `+${m.quantity}` : String(m.quantity)}
                    <span className="text-xs font-normal text-zinc-400 ml-1">{flower.unit}</span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
