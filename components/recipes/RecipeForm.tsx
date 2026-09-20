"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BuilderLayout, type BouquetData, type InitialBuilderItem } from "@/components/bouquet-builder/BuilderLayout"
import { upsertRecipe, type RecipePayload } from "@/app/actions/recipes"
import type { FlowerForBuilder } from "@/components/bouquet-builder/BuilderLayout"

const STYLES = ["нежный", "романтичный", "премиум", "полевой", "свадебный", "яркий", "минимализм"]

/**
 * Показывается, когда ответ действия не получен: брошено исключение (обрыв
 * связи, перезапуск сервера, ошибка сериализации Server Action) либо ответ
 * пришёл без id.
 *
 * Текст намеренно НЕ утверждает ни успеха, ни отката. Сохранение выполняет
 * save_recipe_atomic одной транзакцией, поэтому в базе не бывает половины
 * рецепта — но потерянный ответ не говорит, успела ли эта транзакция
 * закоммититься. Единственный честный ответ — «неизвестно, проверьте».
 */
export const RECIPE_SAVE_UNKNOWN_RESULT =
  "Ответ сервера не получен — сохранился рецепт или нет, неизвестно. Введённые данные и состав остались в форме. Проверьте список рецептов, прежде чем сохранять ещё раз."

/** Финансовый preview формы. Чистая функция — вынесена ради тестов. */
export function computeRecipeFinance(costPrice: number, recommendedPrice: number) {
  const profit = recommendedPrice - costPrice
  return { profit, margin: recommendedPrice > 0 ? (profit / recommendedPrice) * 100 : 0 }
}

export type RecipeSaveOutcome =
  | { kind: "saved"; id: string }
  | { kind: "failed"; message: string }

/**
 * Единственное место, где решается судьба ответа действия. Вынесена из
 * обработчика, потому что здесь живут три существенно разных исхода и их
 * нужно проверять тестами без рендера компонента.
 *
 * - действие вернуло error → показываем его текст как есть (он уже
 *   пользовательский; сообщение базы действие наружу не выпускает);
 * - действие БРОСИЛО → ответ потерян, исход неизвестен;
 * - действие вернуло успех без id → подтверждения нет, считаем тем же
 *   неизвестным исходом, а не успехом.
 */
export async function runRecipeSave(
  save: (payload: RecipePayload) => Promise<{ error?: string; id?: string }>,
  payload: RecipePayload,
): Promise<RecipeSaveOutcome> {
  let result: { error?: string; id?: string }
  try {
    result = await save(payload)
  } catch {
    // Брошенное исключение означает, что ответ не дошёл, а не что сохранение
    // не состоялось: транзакция могла закоммититься.
    return { kind: "failed", message: RECIPE_SAVE_UNKNOWN_RESULT }
  }

  if (!result || typeof result !== "object") return { kind: "failed", message: RECIPE_SAVE_UNKNOWN_RESULT }
  if (result.error) return { kind: "failed", message: result.error }
  // Без id переходить некуда: /recipes/undefined показал бы ошибку вместо
  // рецепта и выглядел бы как подтверждённое сохранение.
  if (typeof result.id !== "string" || !result.id) return { kind: "failed", message: RECIPE_SAVE_UNKNOWN_RESULT }
  return { kind: "saved", id: result.id }
}

type RecipeFormState = {
  recipeId?: string
  name: string
  style: string
  assemblyNotes: string
  comment: string
  recommendedPrice: number
  costPrice: number
  items: BouquetData["items"]
}

/**
 * Переводит состояние формы в payload действия. Вынесена из обработчика,
 * чтобы соответствие полей можно было проверить без рендера компонента.
 */
export function buildRecipePayload(state: RecipeFormState): RecipePayload {
  return {
    id: state.recipeId,
    name: state.name,
    style: state.style,
    assembly_notes: state.assemblyNotes,
    comment: state.comment,
    recommended_price: state.recommendedPrice,
    items: state.items.map((i) => ({
      flower_id: i.flower_id,
      variety_id: i.variety_id ?? null,
      color_id: i.color_id ?? null,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
    })),
    cost_price: state.costPrice,
  }
}

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
  const [bouquetData, setBouquetData] = useState<BouquetData | null>(() => {
    if (!initialRecipe) return null
    const cost = initialRecipe.items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0)
    const price = initialRecipe.recommended_price ?? 0
    return {
      items: initialRecipe.items,
      cost_price: cost,
      sale_price: price,
      profit: price - cost,
      margin_percent: price > 0 ? ((price - cost) / price) * 100 : 0,
    }
  })

  const costPrice = bouquetData?.cost_price ?? 0
  const recPrice = Number(recommendedPrice) || 0
  const { profit, margin } = computeRecipeFinance(costPrice, recPrice)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Второй сабмит поверх незавершённого первого запустил бы ещё одно
    // сохранение того же рецепта. Кнопка уже disabled, но submit приходит и с
    // Enter в поле ввода, поэтому отправку отсекаем и здесь.
    if (isPending) return
    setError("")

    if (!bouquetData || bouquetData.items.length === 0) {
      setError("Добавьте хотя бы один цветок через конструктор букета")
      return
    }

    const payload = buildRecipePayload({
      recipeId,
      name,
      style,
      assemblyNotes,
      comment,
      recommendedPrice: recPrice,
      costPrice,
      items: bouquetData.items,
    })

    startTransition(async () => {
      // Ни одна ветка ниже не сбрасывает состояние формы: при любой неудаче
      // название, стиль, цена и собранный состав остаются на экране, и
      // пользователю не приходится набирать рецепт заново.
      const outcome = await runRecipeSave(upsertRecipe, payload)
      if (outcome.kind === "failed") {
        setError(outcome.message)
        return
      }
      router.push(`/recipes/${outcome.id}`)
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
        <p role="alert" className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
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
