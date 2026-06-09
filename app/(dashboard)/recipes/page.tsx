import Link from "next/link"
import { Plus, BookOpen } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getRecipes } from "@/app/actions/recipes"

const styleColors: Record<string, string> = {
  нежный: "bg-pink-100 text-pink-700",
  романтичный: "bg-rose-100 text-rose-700",
  премиум: "bg-violet-100 text-violet-700",
  полевой: "bg-green-100 text-green-700",
  свадебный: "bg-blue-100 text-blue-700",
  яркий: "bg-orange-100 text-orange-700",
  минимализм: "bg-zinc-100 text-zinc-600",
}

export default async function RecipesPage() {
  const recipes = await getRecipes()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Рецепты букетов</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Шаблоны для быстрой сборки</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-500">
            <BookOpen className="h-4 w-4" />
            {recipes.length} {recipes.length === 1 ? "рецепт" : recipes.length >= 2 && recipes.length <= 4 ? "рецепта" : "рецептов"}
          </div>
          <Link
            href="/recipes/new"
            className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Новый рецепт
          </Link>
        </div>
      </div>

      {recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-xl border border-zinc-200 bg-white">
          <BookOpen className="h-10 w-10 text-zinc-200 mb-3" />
          <p className="text-sm font-medium text-zinc-500">Нет рецептов</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs">
            Создайте шаблон букета — название, состав, рекомендуемая цена
          </p>
          <Link
            href="/recipes/new"
            className="mt-5 flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Создать рецепт
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map((r) => {
            const margin =
              r.recommended_price && r.cost_price && r.recommended_price > 0
                ? ((r.recommended_price - r.cost_price) / r.recommended_price) * 100
                : null

            return (
              <Link
                key={r.id}
                href={`/recipes/${r.id}`}
                className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-rose-200 hover:shadow-sm transition-all space-y-3"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-zinc-800 leading-tight">{r.name}</h3>
                  {r.style && (
                    <Badge
                      className={`text-xs px-2 border-0 shrink-0 ml-2 ${
                        styleColors[r.style] ?? "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {r.style}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm pt-2 border-t border-zinc-50">
                  <div>
                    <p className="text-xs text-zinc-400">Себестоимость</p>
                    <p className="font-medium text-zinc-700">
                      {r.cost_price != null
                        ? `₽${r.cost_price.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                        : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-400">Цена продажи</p>
                    <p className="font-semibold text-zinc-800">
                      {r.recommended_price != null
                        ? `₽${r.recommended_price.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                        : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-400">Маржа</p>
                    <p className={`font-semibold ${
                      margin == null ? "text-zinc-400"
                      : margin >= 40 ? "text-emerald-600"
                      : margin >= 20 ? "text-amber-600"
                      : "text-red-600"
                    }`}>
                      {margin != null ? `${margin.toFixed(0)}%` : "—"}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
