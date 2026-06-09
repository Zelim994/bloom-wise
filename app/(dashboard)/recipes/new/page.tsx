import { getFlowersForBuilder } from "@/app/actions/builder"
import { RecipeForm } from "@/components/recipes/RecipeForm"

export default async function NewRecipePage() {
  const flowers = await getFlowersForBuilder()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Новый рецепт</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Создайте шаблон букета из складских позиций</p>
      </div>
      <RecipeForm flowers={flowers} />
    </div>
  )
}
