import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Pencil } from "lucide-react"
import { getRecipe } from "@/app/actions/recipes"
import { Badge } from "@/components/ui/badge"
import { DeleteRecipeButton } from "@/components/recipes/DeleteRecipeButton"

const styleColors: Record<string, string> = {
  нежный: "bg-pink-100 text-pink-700",
  романтичный: "bg-rose-100 text-rose-700",
  премиум: "bg-violet-100 text-violet-700",
  полевой: "bg-green-100 text-green-700",
  свадебный: "bg-blue-100 text-blue-700",
  яркий: "bg-orange-100 text-orange-700",
  минимализм: "bg-zinc-100 text-zinc-600",
}

export default async function RecipeDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const recipe = await getRecipe(params.id)
  if (!recipe) redirect("/recipes")

  const margin =
    recipe.recommended_price && recipe.cost_price && recipe.recommended_price > 0
      ? ((recipe.recommended_price - recipe.cost_price) / recipe.recommended_price) * 100
      : null

  const profit =
    recipe.recommended_price != null && recipe.cost_price != null
      ? recipe.recommended_price - recipe.cost_price
      : null

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Шапка */}
      <div className="flex items-start gap-3">
        <Link
          href="/recipes"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors mt-0.5 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-zinc-900">{recipe.name}</h1>
            {recipe.style && (
              <Badge className={`text-xs px-2 border-0 ${styleColors[recipe.style] ?? "bg-zinc-100 text-zinc-600"}`}>
                {recipe.style}
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Создан {new Date(recipe.created_at).toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg px-3 py-1.5 hover:bg-zinc-50 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Изменить
          </Link>
          <DeleteRecipeButton recipeId={recipe.id} />
        </div>
      </div>

      {/* Финансы */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Себестоимость</p>
          <p className="text-2xl font-bold text-zinc-800 mt-1 tabular-nums">
            {recipe.cost_price != null
              ? `₽${recipe.cost_price.toLocaleString("ru", { maximumFractionDigits: 0 })}`
              : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Цена продажи</p>
          <p className="text-2xl font-bold text-zinc-800 mt-1 tabular-nums">
            {recipe.recommended_price != null
              ? `₽${recipe.recommended_price.toLocaleString("ru", { maximumFractionDigits: 0 })}`
              : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Маржа</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${
            margin == null ? "text-zinc-400"
            : margin >= 40 ? "text-emerald-600"
            : margin >= 20 ? "text-amber-600"
            : "text-red-600"
          }`}>
            {margin != null ? `${margin.toFixed(1)}%` : "—"}
          </p>
          {profit != null && (
            <p className="text-xs text-zinc-400 mt-0.5">
              прибыль ₽{profit.toLocaleString("ru", { maximumFractionDigits: 0 })}
            </p>
          )}
        </div>
      </div>

      {/* Состав */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">Состав</h2>
          <span className="text-xs text-zinc-400">{recipe.recipe_items.length} позиций</span>
        </div>
        {recipe.recipe_items.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-400">Нет позиций</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">Цветок</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Кол-во</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Цена/ед.</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">Итого</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {recipe.recipe_items.map((item) => {
                const lineTotal = item.quantity * (item.unit_cost ?? 0)
                return (
                  <tr key={item.id} className="hover:bg-zinc-50/50">
                    <td className="px-5 py-3 font-medium text-zinc-800">
                      {item.flowers?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-600 tabular-nums">
                      {item.quantity} {item.flowers?.unit ?? "шт"}
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-600 tabular-nums">
                      {item.unit_cost != null ? `₽${item.unit_cost}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-zinc-800 tabular-nums">
                      ₽{lineTotal.toLocaleString("ru", { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Сборка */}
      {recipe.assembly_notes && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
            Инструкция по сборке
          </p>
          <p className="text-sm text-amber-900">{recipe.assembly_notes}</p>
        </div>
      )}

      {recipe.comment && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
            Комментарий
          </p>
          <p className="text-sm text-zinc-700">{recipe.comment}</p>
        </div>
      )}

      {/* Использовать в заказе */}
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4">
        <div>
          <p className="text-sm font-medium text-zinc-800">Использовать в новом заказе</p>
          <p className="text-xs text-zinc-400 mt-0.5">Создать заказ на основе этого рецепта</p>
        </div>
        <Link
          href="/orders/new"
          className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Создать заказ
        </Link>
      </div>
    </div>
  )
}
