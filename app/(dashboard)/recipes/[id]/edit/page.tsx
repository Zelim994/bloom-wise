import { redirect } from "next/navigation"
import { getRecipe } from "@/app/actions/recipes"
import { getFlowersForBuilder } from "@/app/actions/builder"
import { RecipeForm } from "@/components/recipes/RecipeForm"

export default async function EditRecipePage({
  params,
}: {
  params: { id: string }
}) {
  const [recipe, flowers] = await Promise.all([
    getRecipe(params.id),
    getFlowersForBuilder(),
  ])

  if (!recipe) redirect("/recipes")

  const initialRecipe = {
    id: recipe.id,
    name: recipe.name,
    style: recipe.style ?? null,
    assembly_notes: recipe.assembly_notes ?? null,
    comment: recipe.comment ?? null,
    recommended_price: recipe.recommended_price ?? null,
    items: recipe.recipe_items
      .filter((i) => i.flower_id && i.flowers)
      .map((i) => ({
        flower_id: i.flower_id!,
        name: i.flowers!.name,
        unit: i.flowers!.unit,
        quantity: i.quantity,
        unit_cost: i.unit_cost ?? 0,
      })),
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Редактировать рецепт</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{recipe.name}</p>
      </div>
      <RecipeForm flowers={flowers} recipeId={recipe.id} initialRecipe={initialRecipe} />
    </div>
  )
}
