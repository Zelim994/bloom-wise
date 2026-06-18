"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, X, Check, Loader2, Clock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateFlowerInfo, type FlowerInfoUpdate } from "@/app/actions/inventory"

type FlowerData = {
  id: string
  name: string
  category: string
  sku: string | null
  unit: string
  min_stock: number | null
  sale_price: number | null
  description: string | null
  florist_comment: string | null
}

type ChangeEntry = {
  field: string
  label: string
  old: string
  new_val: string
}

export type HistoryLog = {
  id: string
  created_at: string
  user_id: string | null
  changes: ChangeEntry[] | null
  profiles: { full_name: string | null } | null
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ─── History panel ────────────────────────────────────────────────────────────

function HistoryPanel({ logs }: { logs: HistoryLog[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
        <Clock className="h-4 w-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-800">История изменений</h2>
      </div>

      {logs.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-zinc-400">Изменений пока нет</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-50 max-h-[420px] overflow-y-auto">
          {logs.map((log) => {
            const changes = log.changes ?? []
            const userName = log.profiles?.full_name ?? "Пользователь"
            return (
              <div key={log.id} className="px-5 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-600">{userName}</span>
                  <span className="text-[11px] text-zinc-400">{fmtDateTime(log.created_at)}</span>
                </div>
                {changes.map((c, i) => (
                  <div key={i} className="text-xs text-zinc-500 leading-relaxed">
                    <span className="font-medium text-zinc-700">{c.label}:</span>{" "}
                    <span className="line-through text-zinc-400">{c.old}</span>
                    {" → "}
                    <span className="text-zinc-800 font-medium">{c.new_val}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Info editor ─────────────────────────────────────────────────────────────

interface Props {
  flower: FlowerData
  historyLogs: HistoryLog[]
}

export function FlowerInfoEditor({ flower, historyLogs }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState("")

  // Form state
  const [name, setName]           = useState(flower.name)
  const [category, setCategory]   = useState(flower.category)
  const [sku, setSku]             = useState(flower.sku ?? "")
  const [unit, setUnit]           = useState(flower.unit)
  const [minStock, setMinStock]   = useState(flower.min_stock != null ? String(flower.min_stock) : "")
  const [salePrice, setSalePrice] = useState(flower.sale_price != null ? String(flower.sale_price) : "")
  const [description, setDesc]    = useState(flower.description ?? "")

  function handleCancel() {
    setName(flower.name)
    setCategory(flower.category)
    setSku(flower.sku ?? "")
    setUnit(flower.unit)
    setMinStock(flower.min_stock != null ? String(flower.min_stock) : "")
    setSalePrice(flower.sale_price != null ? String(flower.sale_price) : "")
    setDesc(flower.description ?? "")
    setError("")
    setIsEditing(false)
  }

  function handleSave() {
    setError("")

    const updates: FlowerInfoUpdate = {
      name,
      category,
      sku:        sku.trim() || null,
      unit,
      min_stock:  minStock !== "" ? Number(minStock) : null,
      sale_price: salePrice !== "" ? Number(salePrice) : null,
      description: description.trim() || null,
    }

    startTransition(async () => {
      const result = await updateFlowerInfo(flower.id, updates)
      if (result.error) {
        setError(result.error)
        return
      }
      setIsEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Info block */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-800">Информация</h2>
          </div>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Редактировать
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X className="h-3 w-3" />
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex items-center gap-1.5 text-xs font-medium bg-rose-500 hover:bg-rose-600 text-white px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
              >
                {isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Check className="h-3 w-3" />}
                Сохранить
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-100">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="px-5 py-4 space-y-3">
          {isEditing ? (
            /* ── Edit mode ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Название *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 text-sm border-zinc-200"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Категория *</Label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-8 text-sm border-zinc-200"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">SKU</Label>
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="нет"
                  className="h-8 text-sm border-zinc-200 font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Единица *</Label>
                <Input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="h-8 text-sm border-zinc-200"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Мин. остаток</Label>
                <Input
                  type="number"
                  min={0}
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  placeholder="не задан"
                  className="h-8 text-sm border-zinc-200"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Цена продажи, ₽</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="не задана"
                  className="h-8 text-sm border-zinc-200"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-zinc-400">Описание</Label>
                <textarea
                  value={description}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={2}
                  placeholder="необязательно"
                  className="w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                />
              </div>
            </div>
          ) : (
            /* ── View mode ── */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Название</p>
                <p className="font-medium text-zinc-800">{flower.name}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Категория</p>
                <p className="font-medium text-zinc-800">{flower.category}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Единица</p>
                <p className="font-medium text-zinc-800">{flower.unit}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">SKU</p>
                <p className="font-mono text-zinc-600">{flower.sku ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Мин. остаток</p>
                <p className="font-medium text-zinc-800">
                  {flower.min_stock != null && flower.min_stock > 0
                    ? `${flower.min_stock} ${flower.unit}`
                    : "не задан"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Цена продажи</p>
                <p className="font-medium text-zinc-800">
                  {flower.sale_price != null
                    ? `₽${flower.sale_price.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                    : "—"}
                </p>
              </div>
              {flower.description && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-xs text-zinc-400 mb-0.5">Описание</p>
                  <p className="text-zinc-600">{flower.description}</p>
                </div>
              )}
              {flower.florist_comment && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-xs text-zinc-400 mb-0.5">Комментарий флориста</p>
                  <p className="text-zinc-600">{flower.florist_comment}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <HistoryPanel logs={historyLogs} />
    </div>
  )
}
