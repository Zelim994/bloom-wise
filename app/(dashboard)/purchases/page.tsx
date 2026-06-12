import Link from "next/link"
import { Plus, Truck, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getPurchases } from "@/app/actions/purchases"

function pluralize(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "поставка"
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "поставки"
  return "поставок"
}

export default async function PurchasesPage() {
  const purchases = await getPurchases()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Поставки</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Поступление товара от поставщиков</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
            <Truck className="h-4 w-4 text-zinc-400" />
            <span className="font-medium">{purchases.length}</span>
            <span className="text-zinc-400">{pluralize(purchases.length)}</span>
          </div>
          <Link
            href="/purchases/new"
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Новая поставка
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Truck className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500">Нет поставок</p>
            <p className="text-xs text-zinc-400 mt-1">Оформите первую поставку товара</p>
            <Link
              href="/purchases/new"
              className="mt-4 flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Новая поставка
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Дата</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Поставщик</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden md:table-cell">Комментарий</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Сумма</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Статус</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-zinc-50 transition-colors group cursor-pointer ${
                    i === purchases.length - 1 ? "border-0" : ""
                  }`}
                >
                  <td className="p-0 text-zinc-500 tabular-nums">
                    <Link href={`/purchases/${p.id}`} className="block px-4 py-3 group-hover:text-rose-600 transition-colors">
                      {new Date(p.purchase_date).toLocaleDateString("ru", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/purchases/${p.id}`} className="block px-4 py-3 font-medium text-zinc-800 group-hover:text-rose-600 transition-colors">
                      {p.suppliers?.name ?? <span className="text-zinc-400 font-normal italic">Без поставщика</span>}
                    </Link>
                  </td>
                  <td className="p-0 text-zinc-400 text-xs hidden md:table-cell max-w-[200px] truncate">
                    <Link href={`/purchases/${p.id}`} className="block px-4 py-3">
                      {p.comment ?? "—"}
                    </Link>
                  </td>
                  <td className="p-0 text-right">
                    <Link href={`/purchases/${p.id}`} className="block px-4 py-3 font-semibold text-zinc-800 tabular-nums group-hover:text-rose-600 transition-colors">
                      {p.total_amount != null
                        ? `₽ ${p.total_amount.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                        : "—"}
                    </Link>
                  </td>
                  <td className="p-0 text-right hidden sm:table-cell">
                    <Link href={`/purchases/${p.id}`} className="block px-4 py-3">
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs rounded-md">
                        Проведена
                      </Badge>
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/purchases/${p.id}`} className="flex items-center justify-center px-3 py-3 text-zinc-300 group-hover:text-rose-400 transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
