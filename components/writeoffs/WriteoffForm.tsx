"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ArrowLeft, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createWriteoffAct, type FlowerForWriteoff } from "@/app/actions/writeoffs"

type WriteoffLine = {
  _id: string
  flower_id: string
  inventory_item_id: string
  quantity: string
  reason: string
  comment: string
}

const REASONS = [
  "Брак",
  "Истёк срок",
  "Механическое повреждение",
  "Оформление / витрина",
  "Другое",
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function makeLine(): WriteoffLine {
  return {
    _id: Math.random().toString(36).slice(2),
    flower_id: "",
    inventory_item_id: "",
    quantity: "",
    reason: "Брак",
    comment: "",
  }
}

interface Props {
  flowers: FlowerForWriteoff[]
}

export function WriteoffForm({ flowers }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const [writeoffDate, setWriteoffDate] = useState(today())
  const [actComment, setActComment] = useState("")
  const [lines, setLines] = useState<WriteoffLine[]>([makeLine()])

  const flowerMap = new Map(flowers.map((f) => [f.id, f]))

  function updateLine(id: string, field: keyof WriteoffLine, value: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line._id !== id) return line
        const updated = { ...line, [field]: value }
        // Когда меняется цветок — автоматически выбираем первую (FIFO) партию
        if (field === "flower_id") {
          const flower = flowerMap.get(value)
          updated.inventory_item_id = flower?.batches[0]?.id ?? ""
          updated.quantity = ""
        }
        return updated
      })
    )
  }

  function removeLine(id: string) {
    setLines((prev) => {
      if (prev.length > 1) return prev.filter((l) => l._id !== id)
      return [makeLine()]
    })
  }

  function addLine() {
    setLines((prev) => [...prev, makeLine()])
  }

  const totalLoss = lines.reduce((sum, line) => {
    const flower = flowerMap.get(line.flower_id)
    const batch = flower?.batches.find((b) => b.id === line.inventory_item_id)
    const qty = Number(line.quantity) || 0
    return sum + (batch?.cost_price ?? 0) * qty
  }, 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    const filled = lines.filter(
      (l) => l.flower_id && l.inventory_item_id && Number(l.quantity) > 0
    )
    if (filled.length === 0) {
      setError("Добавьте хотя бы один товар с количеством")
      return
    }

    // Проверяем превышение остатка
    for (const line of filled) {
      const flower = flowerMap.get(line.flower_id)
      const batch = flower?.batches.find((b) => b.id === line.inventory_item_id)
      if (batch && Number(line.quantity) > batch.quantity_remaining) {
        setError(
          `${flower?.name}: в партии только ${batch.quantity_remaining} ${flower?.unit ?? "шт"}, указано ${line.quantity}`
        )
        return
      }
    }

    startTransition(async () => {
      const result = await createWriteoffAct({
        writeoff_date: writeoffDate,
        comment: actComment,
        items: filled.map((line) => {
          const flower = flowerMap.get(line.flower_id)
          const batch = flower?.batches.find((b) => b.id === line.inventory_item_id)
          const qty = Number(line.quantity)
          return {
            flower_id: line.flower_id,
            inventory_item_id: line.inventory_item_id,
            quantity: qty,
            reason: line.reason,
            comment: line.comment,
            loss_amount: (batch?.cost_price ?? 0) * qty,
          }
        }),
      })

      if (result.error) {
        setError(result.error)
        return
      }
      router.push("/writeoffs")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Шапка акта */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
              Дата акта
            </Label>
            <Input
              type="date"
              value={writeoffDate}
              onChange={(e) => setWriteoffDate(e.target.value)}
              required
              className="border-zinc-200 h-10"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
              Комментарий к акту
            </Label>
            <Input
              value={actComment}
              onChange={(e) => setActComment(e.target.value)}
              placeholder="Причина акта, ответственный..."
              className="border-zinc-200 h-10"
            />
          </div>
        </div>
      </div>

      {/* Таблица строк */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide min-w-[200px]">Товар</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide min-w-[220px]">Партия</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-24">Кол-во</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide w-44">Причина</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-28">Себест. / шт</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-28">Убыток, ₽</th>
                <th className="px-3 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const flower = flowerMap.get(line.flower_id)
                const batch = flower?.batches.find((b) => b.id === line.inventory_item_id)
                const qty = Number(line.quantity) || 0
                const costPerUnit = batch?.cost_price ?? 0
                const lineTotal = costPerUnit * qty
                const maxQty = batch?.quantity_remaining ?? 0
                const overLimit = qty > 0 && maxQty > 0 && qty > maxQty

                return (
                  <tr
                    key={line._id}
                    className={`border-b border-zinc-50 last:border-0 ${overLimit ? "bg-red-50/40" : "hover:bg-zinc-50/40"}`}
                  >
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{idx + 1}</td>

                    {/* Товар */}
                    <td className="px-4 py-2.5">
                      <select
                        value={line.flower_id}
                        onChange={(e) => updateLine(line._id, "flower_id", e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                      >
                        <option value="">— Выберите товар —</option>
                        {flowers.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} — {f.current_stock} {f.unit}
                          </option>
                        ))}
                      </select>
                      {flower && (
                        <p className="text-xs text-zinc-400 mt-0.5 px-0.5">
                          {flower.category}
                        </p>
                      )}
                    </td>

                    {/* Партия */}
                    <td className="px-4 py-2.5">
                      {!line.flower_id ? (
                        <span className="text-xs text-zinc-300">—</span>
                      ) : !flower || flower.batches.length === 0 ? (
                        <div className="flex items-center gap-1.5 text-amber-600 text-xs">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          Нет партий
                        </div>
                      ) : (
                        <select
                          value={line.inventory_item_id}
                          onChange={(e) => updateLine(line._id, "inventory_item_id", e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                        >
                          {flower.batches.map((b, bi) => (
                            <option key={b.id} value={b.id}>
                              {bi === 0 ? "★ " : ""}
                              {new Date(b.arrived_at + "T00:00:00").toLocaleDateString("ru", { day: "numeric", month: "short" })}
                              {" · "}{b.quantity_remaining} {flower.unit}
                              {" · ₽"}{b.cost_price}/шт
                              {b.expires_at ? ` · до ${new Date(b.expires_at + "T00:00:00").toLocaleDateString("ru", { day: "numeric", month: "short" })}` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Количество */}
                    <td className="px-4 py-2.5">
                      <Input
                        type="number"
                        min={1}
                        max={maxQty || undefined}
                        value={line.quantity}
                        onChange={(e) => updateLine(line._id, "quantity", e.target.value)}
                        placeholder="0"
                        disabled={!line.inventory_item_id}
                        className={`border-zinc-200 h-8 text-right text-sm tabular-nums ${overLimit ? "border-red-400 bg-red-50" : ""}`}
                      />
                      {batch && (
                        <p className="text-xs text-zinc-400 mt-0.5 text-right">
                          макс {maxQty}
                        </p>
                      )}
                    </td>

                    {/* Причина */}
                    <td className="px-4 py-2.5">
                      <select
                        value={line.reason}
                        onChange={(e) => updateLine(line._id, "reason", e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                      >
                        {REASONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </td>

                    {/* Себестоимость / шт */}
                    <td className="px-4 py-2.5 text-right">
                      {batch ? (
                        <span className="text-sm font-medium text-zinc-700 tabular-nums">
                          ₽{costPerUnit.toLocaleString("ru", { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>

                    {/* Убыток итого */}
                    <td className="px-4 py-2.5 text-right">
                      {lineTotal > 0 ? (
                        <span className="text-sm font-semibold text-red-600 tabular-nums">
                          −₽{lineTotal.toLocaleString("ru", { maximumFractionDigits: 0 })}
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => removeLine(line._id)}
                        className="text-zinc-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer таблицы */}
        <div className="border-t border-zinc-100 px-4 py-3 flex items-center justify-between bg-zinc-50">
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1.5 text-sm text-rose-500 hover:text-rose-600 font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Добавить строку
          </button>

          <div className="flex items-center gap-5 text-sm">
            <span className="text-zinc-400">
              {lines.filter((l) => l.flower_id).length} позиций
            </span>
            {totalLoss > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Общий убыток:</span>
                <span className="text-base font-bold text-red-600 tabular-nums">
                  −₽{totalLoss.toLocaleString("ru", { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={isPending}
          className="bg-rose-500 hover:bg-rose-600 text-white h-10 px-6"
        >
          {isPending ? "Проводим..." : "Провести акт списания"}
        </Button>
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Отмена
        </button>
      </div>
    </form>
  )
}
