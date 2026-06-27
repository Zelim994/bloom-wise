import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { getWriteoffs } from "@/app/actions/writeoffs"

const reasonColors: Record<string, string> = {
  "Брак": "bg-red-100 text-red-700",
  "Истёк срок": "bg-amber-100 text-amber-700",
  "Механическое повреждение": "bg-orange-100 text-orange-700",
  "Оформление / витрина": "bg-violet-100 text-violet-700",
  "Другое": "bg-zinc-100 text-zinc-600",
}


export default async function WriteoffsPage() {
  const writeoffs = await getWriteoffs()
  const totalLoss = writeoffs.reduce((s, w) => s + (w.loss_amount ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Списания</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Акты списания брака и потерь</p>
        </div>
        <div className="flex items-center gap-3">
          {totalLoss > 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm">
              <span className="text-zinc-500">Убыток: </span>
              <span className="font-semibold text-red-600 tabular-nums">
                −₽{totalLoss.toLocaleString("ru", { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          <Link
            href="/writeoffs/new"
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Акт списания
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {writeoffs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Trash2 className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500">Нет списаний</p>
            <p className="text-xs text-zinc-400 mt-1">Здесь появятся оформленные акты</p>
            <Link
              href="/writeoffs/new"
              className="mt-4 flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Акт списания
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Дата</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Товар</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Причина</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Кол-во</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Себест. / шт</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Убыток</th>
              </tr>
            </thead>
            <tbody>
              {writeoffs.map((w, i) => (
                <tr
                  key={w.id}
                  className={`border-b border-zinc-50 hover:bg-zinc-50/80 transition-colors ${
                    i === writeoffs.length - 1 ? "border-0" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-zinc-500 tabular-nums text-xs">
                    {new Date(w.writeoff_date).toLocaleDateString("ru", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-800">
                      {w.flowers?.name ?? "—"}
                    </p>
                    {w.comment && (
                      <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-[200px]">{w.comment}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {w.reason ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                        reasonColors[w.reason] ?? "bg-zinc-100 text-zinc-600"
                      }`}>
                        {w.reason}
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700 tabular-nums">
                    {w.quantity} {w.flowers?.unit ?? "шт"}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-500 tabular-nums text-xs">
                    {w.loss_amount != null && w.quantity > 0
                      ? `₽${(w.loss_amount / w.quantity).toLocaleString("ru", { maximumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {w.loss_amount != null ? (
                      <span className="font-semibold text-red-600">
                        −₽{w.loss_amount.toLocaleString("ru", { maximumFractionDigits: 0 })}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50">
                <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-zinc-700 text-right">
                  Итого убыток:
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-base font-bold text-red-600 tabular-nums">
                    −₽{totalLoss.toLocaleString("ru", { maximumFractionDigits: 0 })}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
