"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BuilderLayout, type BouquetData, type InitialBuilderItem } from "@/components/bouquet-builder/BuilderLayout"
import { upsertRecipe } from "@/app/actions/recipes"
import type { FlowerForBuilder } from "@/components/bouquet-builder/BuilderLayout"

const STYLES = ["нежный", "романтичный", "премиум", "полевой", "свадебный", "яркий", "минимализм"]

interface InitialRecipe {
  id: string
  name: string
  style: string | null
  assembly_notes: string | null
  comment: string | null
  recommended_price: number | null
  items: InitialBuilderItem[]
}

interface Props {
  flowers: FlowerForBuilder[]
  recipeId?: string
  initialRecipe?: InitialRecipe
}

export function RecipeForm({ flowers, recipeId, initialRecipe }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const [name, setName] = useState(initialRecipe?.name ?? "")
  const [style, setStyle] = useState(initialRecipe?.style ?? "")
  const [assemblyNotes, setAssemblyNotes] = useState(initialRecipe?.assembly_notes ?? "")
  const [comment, setComment] = useState(initialRecipe?.comment ?? "")
  const [recommendedPrice, setRecommendedPrice] = useState(
    initialRecipe?.recommended_price ? String(initialRecipe.recommended_price) : ""
  )
  const [bouquetData, setBouquetData] = useState<BouquetData | null>(null)

  const costPrice = bouquetData?.cost_price ?? 0
  const recPrice = Number(recommendedPrice) || 0
  const profit = recPrice - costPrice
  const margin = recPrice > 0 ? (profit / recPrice) * 100 : 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!bouquetData || bouquetData.items.length === 0) {
      setError("Добавьте хотя бы один цветок через конструктор букета")
      return
    }

    startTransition(async () => {
      const result = await upsertRecipe({
        id: recipeId,
        name,
        style,
        assembly_notes: assemblyNotes,
        comment,
        recommended_price: recPrice,
        items: bouquetData.items.map((i) => ({
          flower_id: i.flower_id,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
        })),
        cost_price: costPrice,
      })

      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/recipes/${result.id}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад
      </button>

      {/* Метаданные рецепта */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-zinc-100">
          <BookOpen className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-700">Информация о рецепте</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Название *
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Нежный рассвет"
              required
              className="border-zinc-200 h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Рекомендуемая цена, ₽
            </Label>
            <Input
              type="number"
              min={0}
              step={50}
              value={recommendedPrice}
              onChange={(e) => setRecommendedPrice(e.target.value)}
              placeholder="0"
              className="border-zinc-200 h-10 tabular-nums"
            />
          </div>
        </div>

        {/* Стиль */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            Стиль
          </Label>
          <div className="flex gap-1.5 flex-wrap">
            {STYLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(style === s ? "" : s)}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors font-medium ${
                  style === s
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Финансовый preview */}
        {costPrice > 0 && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
              <p className="text-[10px] text-zinc-400 uppercase tracking-wide font-semibold">Себестоимость</p>
              <p className="text-base font-bold text-zinc-800 mt-0.5">₽{costPrice.toLocaleString("ru", { maximumFractionDigits: 0 })}</p>
            </div>
            {recPrice > 0 && (
              <>
                <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wide font-semibold">Прибыль</p>
                  <p className={`text-base font-bold mt-0.5 ${profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {profit >= 0 ? "+" : "−"}₽{Math.abs(profit).toLocaleString("ru", { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wide font-semibold">Маржа</p>
                  <p className={`text-base font-bold mt-0.5 ${margin >= 40 ? "text-emerald-700" : margin >= 20 ? "text-amber-700" : "text-red-700"}`}>
                    {margin.toFixed(1)}%
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Инструкция по сборке
            </Label>
            <Input
              value={assemblyNotes}
              onChange={(e) => setAssemblyNotes(e.target.value)}
              placeholder="Начинаем с каркаса из зелени..."
              className="border-zinc-200 h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Комментарий
            </Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Для особых случаев..."
              className="border-zinc-200 h-10"
            />
          </div>
        </div>
      </div>

      {/* Builder */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-700">Состав рецепта</h2>
          {flowers.length === 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              Нет товаров на складе
            </span>
          )}
        </div>
        <BuilderLayout
          flowers={flowers}
          onChange={setBouquetData}
          initialItems={initialRecipe?.items}
          initialSalePrice={initialRecipe?.recommended_price ?? undefined}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          disabled={isPending}
          className="bg-rose-500 hover:bg-rose-600 text-white h-10 px-6"
        >
          {isPending ? "Сохраняем..." : "Сохранить рецепт"}
        </Button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          Отмена
        </button>
      </div>
    </form>
  )
}
