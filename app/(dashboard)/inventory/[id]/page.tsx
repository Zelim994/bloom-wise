import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Package } from "lucide-react"
import {
  getFlowerById,
  getFlowerInventoryItems,
  getFlowerMovements,
} from "@/app/actions/inventory"

const freshnessColors: Record<string, string> = {
  fresh: "bg-emerald-100 text-emerald-700",
  aging: "bg-amber-100 text-amber-700",
  critical: "bg-orange-100 text-orange-700",
  expired: "bg-red-100 text-red-700",
}
const freshnessLabels: Record<string, string> = {
  fresh: "Свежий",
  aging: "Стареет",
  critical: "Критично",
  expired: "Просрочен",
}

const movementMeta: Record<string, { label: string; color: string }> = {
  purchase: { label: "Приход", color: "text-emerald-600" },
  sale: { label: "Продажа", color: "text-blue-600" },
  writeoff: { label: "Списание", color: "text-red-600" },
  return: { label: "Возврат", color: "text-orange-600" },
  adjustment: { label: "Коррекция", color: "text-zinc-600" },
  bouquet_reserved: { label: "Резерв", color: "text-purple-600" },
  bouquet_unreserved: { label: "Снят резерв", color: "text-zinc-500" },
}

export default async function InventoryItemPage({
  params,
}: {
  params: { id: string }
}) {
  const [flower, batches, movements] = await Promise.all([
    getFlowerById(params.id),
    getFlowerInventoryItems(params.id),
    getFlowerMovements(params.id),
  ])

  if (!flower) redirect("/inventory")

  const minStock = flower.min_stock ?? 0
  const stockColor =
    flower.current_stock === 0
      ? "text-red-600"
      : minStock > 0 && flower.current_stock <= minStock
      ? "text-amber-600"
      : "text-emerald-600"

  const stockLabel =
    flower.current_stock === 0
      ? "Нет в наличии"
      : minStock > 0 && flower.current_stock <= minStock
      ? "Мало"
      : "В норме"

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Шапка */}
      <div className="flex items-center gap-3">
        <Link
          href="/inventory"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{flower.name}</h1>
          <p className="text-sm text-zinc-500">
            {flower.category} · {flower.unit}
          </p>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Остаток</p>
          <p className={`text-3xl font-bold mt-1 ${stockColor}`}>
            {flower.current_stock}
            <span className="text-base font-normal ml-1">{flower.unit}</span>
          </p>
          <p className={`text-xs mt-1 font-medium ${stockColor}`}>{stockLabel}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Мин. остаток</p>
          <p className="text-3xl font-bold mt-1 text-zinc-700">
            {minStock > 0 ? minStock : "—"}
            {minStock > 0 && <span className="text-base font-normal ml-1">{flower.unit}</span>}
          </p>
          <p className="text-xs mt-1 text-zinc-400">порог пополнения</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Себест. (FIFO)</p>
          <p className="text-3xl font-bold mt-1 text-zinc-700">
            {batches[0]?.cost_price != null
              ? `₽${batches[0].cost_price.toLocaleString("ru", { maximumFractionDigits: 2 })}`
              : "—"}
          </p>
          <p className="text-xs mt-1 text-zinc-400">текущая партия</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Цена продажи</p>
          <p className="text-3xl font-bold mt-1 text-emerald-600">
            {flower.sale_price != null
              ? `₽${flower.sale_price.toLocaleString("ru", { maximumFractionDigits: 0 })}`
              : "—"}
          </p>
          {flower.sale_price != null && batches[0]?.cost_price != null && (
            <p className="text-xs mt-1 text-zinc-400">
              маржа{" "}
              {flower.sale_price > 0
                ? `${(((flower.sale_price - batches[0].cost_price) / flower.sale_price) * 100).toFixed(0)}%`
                : "—"}
            </p>
          )}
          {flower.sale_price == null && (
            <p className="text-xs mt-1 text-zinc-400">не задана</p>
          )}
        </div>
      </div>

      {/* Партии (inventory_items, FIFO) */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">Активные партии</h2>
          <span className="text-xs text-zinc-400">{batches.length} партий</span>
        </div>

        {batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Package className="h-8 w-8 text-zinc-300 mb-2" />
            <p className="text-sm text-zinc-500">Нет активных партий</p>
            <Link href="/purchases/new" className="text-sm text-rose-500 hover:underline mt-1">
              Оформить поставку
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Дата поставки</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Остаток</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Себест.</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Срок</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide hidden md:table-cell">Свежесть</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {batches.map((b) => {
                const expiryDate = b.expires_at ? new Date(b.expires_at) : null
                const daysLeft = expiryDate
                  ? Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)
                  : null
                const status = b.freshness_status ?? "fresh"

                return (
                  <tr key={b.id} className="hover:bg-zinc-50/50">
                    <td className="px-5 py-3 text-zinc-700">
                      {new Date(b.arrived_at).toLocaleDateString("ru", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-zinc-800">
                      {b.quantity_remaining}
                      <span className="text-xs font-normal text-zinc-400 ml-1">
                        / {b.quantity_in}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-700">
                      ₽{b.cost_price}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium hidden sm:table-cell ${
                      daysLeft === null
                        ? "text-zinc-400"
                        : daysLeft < 0
                        ? "text-red-600"
                        : daysLeft <= 3
                        ? "text-orange-600"
                        : "text-zinc-700"
                    }`}>
                      {daysLeft === null
                        ? "—"
                        : daysLeft < 0
                        ? "Просрочен"
                        : daysLeft === 0
                        ? "Сегодня"
                        : `${daysLeft} дн.`}
                    </td>
                    <td className="px-5 py-3 text-center hidden md:table-cell">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        freshnessColors[status] ?? "bg-zinc-100 text-zinc-600"
                      }`}>
                        {freshnessLabels[status] ?? status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* История движений (stock_movements) */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">История движений</h2>
          <span className="text-xs text-zinc-400">{movements.length} записей</span>
        </div>

        {movements.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-400">Нет движений</div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {movements.map((m) => {
              const meta = movementMeta[m.movement_type] ?? {
                label: m.movement_type,
                color: "text-zinc-600",
              }
              return (
                <div key={m.id} className="flex items-start justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${meta.color}`}>{meta.label}</p>
                    {m.comment && (
                      <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-xs">{m.comment}</p>
                    )}
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {new Date(m.created_at ?? "").toLocaleString("ru", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ml-4 shrink-0 ${
                      m.quantity > 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {m.quantity > 0 ? `+${m.quantity}` : String(m.quantity)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {flower.florist_comment && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
            Комментарий флориста
          </p>
          <p className="text-sm text-amber-900">{flower.florist_comment}</p>
        </div>
      )}
    </div>
  )
}
