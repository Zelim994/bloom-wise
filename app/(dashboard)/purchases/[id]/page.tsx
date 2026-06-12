import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Truck, ExternalLink, Package, Pencil } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getPurchaseDetail } from "@/app/actions/purchases"

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getPurchaseDetail(id)
  if (!detail) redirect("/purchases")

  const totalGoods = detail.items.reduce(
    (s, i) => s + i.quantity * i.cost_price,
    0
  )
  const totalDelivery = detail.items.reduce(
    (s, i) => s + (i.extra_costs ?? 0),
    0
  )
  const totalItems = detail.items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Шапка */}
      <div className="flex items-start gap-3">
        <Link
          href="/purchases"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors mt-0.5 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-zinc-900">
              {detail.suppliers?.name ?? "Поставка"}
            </h1>
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs rounded-md">
              Проведена
            </Badge>
            <Link
              href={`/purchases/${detail.id}/edit`}
              className="ml-auto flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg px-3 py-1.5 bg-white hover:bg-zinc-50 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Редактировать
            </Link>
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">
            {new Date(detail.purchase_date).toLocaleDateString("ru", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          {detail.comment && (
            <p className="text-xs text-zinc-400 mt-1">{detail.comment}</p>
          )}
        </div>
      </div>

      {/* Итоги */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Позиций</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">{detail.items.length}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{totalItems} шт всего</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Товары</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1 tabular-nums">
            ₽{totalGoods.toLocaleString("ru", { maximumFractionDigits: 0 })}
          </p>
          {totalDelivery > 0 && (
            <p className="text-xs text-blue-500 mt-0.5">
              +₽{totalDelivery.toLocaleString("ru", { maximumFractionDigits: 0 })} доставка
            </p>
          )}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Итого</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1 tabular-nums">
            ₽{(detail.total_amount ?? 0).toLocaleString("ru", { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Таблица товаров */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Товар</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Кол-во</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Цена закупки</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Доставка</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Себест./шт</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Срок</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {detail.items.map((item) => {
                const deliveryPerUnit =
                  item.extra_costs && item.quantity > 0
                    ? item.extra_costs / item.quantity
                    : 0
                const effectiveCost = item.cost_price + deliveryPerUnit
                const expiryDate = item.expires_at
                  ? new Date(item.expires_at + "T00:00:00")
                  : null
                const daysLeft = expiryDate
                  ? Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)
                  : null

                return (
                  <tr key={item.id} className="hover:bg-zinc-50/60 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-zinc-800">
                            {item.flowers?.name ?? "—"}
                          </p>
                          {item.flowers?.unit && (
                            <p className="text-xs text-zinc-400 mt-0.5">{item.flowers.unit}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-zinc-800 tabular-nums">
                      {item.quantity}
                      <span className="text-xs font-normal text-zinc-400 ml-1">
                        {item.flowers?.unit ?? "шт"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-600 tabular-nums">
                      ₽{item.cost_price.toLocaleString("ru", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums hidden sm:table-cell">
                      {deliveryPerUnit > 0 ? (
                        <span className="text-blue-500 text-xs">
                          +₽{deliveryPerUnit.toLocaleString("ru", { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-zinc-800 tabular-nums">
                      ₽{effectiveCost.toLocaleString("ru", { maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-5 py-3 text-right text-xs tabular-nums ${
                      daysLeft === null
                        ? "text-zinc-400"
                        : daysLeft < 0
                        ? "text-red-600 font-medium"
                        : daysLeft <= 3
                        ? "text-orange-600 font-medium"
                        : "text-zinc-600"
                    }`}>
                      {daysLeft === null
                        ? "—"
                        : daysLeft < 0
                        ? "Просрочен"
                        : daysLeft === 0
                        ? "Сегодня"
                        : `${daysLeft} дн.`}
                    </td>
                    <td className="px-3 py-3">
                      {item.flower_id && (
                        <Link
                          href={`/inventory/${item.flower_id}`}
                          title="Открыть карточку товара"
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
                <td className="px-5 py-3 text-right font-semibold text-zinc-700 tabular-nums">
                  {totalItems} шт
                </td>
                <td className="px-5 py-3 text-right font-semibold text-zinc-700 tabular-nums">
                  ₽{totalGoods.toLocaleString("ru", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-5 py-3 text-right text-blue-500 font-medium tabular-nums hidden sm:table-cell">
                  {totalDelivery > 0
                    ? `+₽${totalDelivery.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                    : "—"}
                </td>
                <td colSpan={3} className="px-5 py-3 text-right">
                  <span className="text-base font-bold text-zinc-900 tabular-nums">
                    ₽{(detail.total_amount ?? 0).toLocaleString("ru", { maximumFractionDigits: 0 })}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Поставщик */}
      {detail.suppliers?.name && (
        <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold mb-0.5">Поставщик</p>
            <p className="text-sm font-medium text-zinc-800">{detail.suppliers.name}</p>
          </div>
          <Link
            href="/settings/suppliers"
            className="text-xs text-zinc-400 hover:text-rose-500 transition-colors"
          >
            Все поставщики →
          </Link>
        </div>
      )}
    </div>
  )
}
