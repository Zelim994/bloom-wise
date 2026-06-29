"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { archiveRecipe } from "@/app/actions/recipes"

export function DeleteRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    const confirmed = confirm(
      "Удалить рецепт?\n\nРецепт будет скрыт из активного списка, но история не удалится.\n\nПродолжить?"
    )
    if (!confirmed) return
    startTransition(async () => {
      await archiveRecipe(recipeId)
      router.push("/recipes")
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 border border-red-100 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Удалить
    </button>
  )
}
