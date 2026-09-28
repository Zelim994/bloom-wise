// RECIPE-SAVE-ATOMIC: чистые части RecipeForm.
//
// В проекте нет jsdom и testing-library (см. package.json), поэтому форма
// целиком не рендерится. Проверяемое здесь — ровно та логика, которая раньше
// жила внутри обработчика сабмита и решала судьбу ответа действия: она вынесена
// в runRecipeSave/buildRecipePayload именно для того, чтобы её можно было
// проверить без рендера.
//
// Рендер, submit, disabled и повторный submit во время ожидания отдельно
// проверяются scripts/recipe-save.browser.mjs в настоящем браузере.
//
// Зависимости модуля заглушены: импортируется он ради двух чистых функций, а не
// ради React-дерева.

import { describe, expect, it, vi } from "vitest"

import type { RecipePayload } from "@/app/actions/recipes"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}))

vi.mock("lucide-react", () => ({
  ArrowLeft: () => null,
  BookOpen: () => null,
}))

vi.mock("@/components/ui/button", () => ({ Button: () => null }))
vi.mock("@/components/ui/input", () => ({ Input: () => null }))
vi.mock("@/components/ui/label", () => ({ Label: () => null }))
vi.mock("@/components/bouquet-builder/BuilderLayout", () => ({ BuilderLayout: () => null }))
vi.mock("@/app/actions/recipes", () => ({ upsertRecipe: vi.fn() }))

const { RECIPE_SAVE_UNKNOWN_RESULT, buildRecipePayload, computeRecipeFinance, runRecipeSave } =
  await import("@/components/recipes/RecipeForm")

const PAYLOAD: RecipePayload = {
  name: "Нежный рассвет",
  style: "нежный",
  assembly_notes: "",
  comment: "",
  recommended_price: 4000,
  cost_price: 1200,
  items: [{ flower_id: "flw-1", variety_id: null, color_id: null, quantity: 9, unit_cost: 100 }],
}

describe("runRecipeSave", () => {
  it("возвращает id подтверждённого сохранения", async () => {
    const save = vi.fn(async () => ({ id: "rec-1" }))

    expect(await runRecipeSave(save, PAYLOAD)).toEqual({ kind: "saved", id: "rec-1" })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(PAYLOAD)
  })

  it("показывает сообщение действия как есть", async () => {
    const save = vi.fn(async () => ({ error: "Укажите название рецепта" }))

    expect(await runRecipeSave(save, PAYLOAD)).toEqual({
      kind: "failed",
      message: "Укажите название рецепта",
    })
  })

  it("не выдаёт успех за брошенное исключение — исход неизвестен", async () => {
    const save = vi.fn(async () => {
      throw new Error("Failed to fetch")
    })

    const outcome = await runRecipeSave(save, PAYLOAD)

    expect(outcome).toEqual({ kind: "failed", message: RECIPE_SAVE_UNKNOWN_RESULT })
    // Текст ошибки транспорта пользователю не показывается
    expect(JSON.stringify(outcome)).not.toContain("Failed to fetch")
  })

  it("не выдаёт успех за ответ без id", async () => {
    const save = vi.fn(async () => ({}))

    expect(await runRecipeSave(save, PAYLOAD)).toEqual({
      kind: "failed",
      message: RECIPE_SAVE_UNKNOWN_RESULT,
    })
  })

  it("считает пустой id отсутствующим", async () => {
    const save = vi.fn(async () => ({ id: "" }))

    expect(await runRecipeSave(save, PAYLOAD)).toEqual({
      kind: "failed",
      message: RECIPE_SAVE_UNKNOWN_RESULT,
    })
  })

  it("приоритет у error, даже если пришёл и id", async () => {
    const save = vi.fn(async () => ({ error: "Рецепт не найден", id: "rec-1" }))

    expect(await runRecipeSave(save, PAYLOAD)).toEqual({
      kind: "failed",
      message: "Рецепт не найден",
    })
  })
})

describe("RECIPE_SAVE_UNKNOWN_RESULT", () => {
  it("не утверждает ни сохранения, ни отката", () => {
    expect(RECIPE_SAVE_UNKNOWN_RESULT).toMatch(/неизвестно/)
    expect(RECIPE_SAVE_UNKNOWN_RESULT).not.toMatch(/сохранён|сохранен|успешно/i)
    expect(RECIPE_SAVE_UNKNOWN_RESULT).not.toMatch(/откат|отменен|отменён|не сохранил/i)
  })

  it("говорит, что введённые данные остались в форме, и предлагает проверить", () => {
    expect(RECIPE_SAVE_UNKNOWN_RESULT).toMatch(/остались в форме/)
    expect(RECIPE_SAVE_UNKNOWN_RESULT).toMatch(/Проверьте список рецептов/)
  })
})

describe("buildRecipePayload", () => {
  it("переносит поля формы без потерь", () => {
    expect(
      buildRecipePayload({
        recipeId: "rec-7",
        name: "Пионовый сад",
        style: "премиум",
        assemblyNotes: "Каркас из зелени",
        comment: "Для свадеб",
        recommendedPrice: 5000,
        costPrice: 2000,
        items: [
          {
            flower_id: "flw-1",
            name: "Пион",
            unit: "шт",
            quantity: 5,
            unit_cost: 400,
            variety_id: "var-1",
            color_id: "clr-1",
          },
        ],
      }),
    ).toEqual({
      id: "rec-7",
      name: "Пионовый сад",
      style: "премиум",
      assembly_notes: "Каркас из зелени",
      comment: "Для свадеб",
      recommended_price: 5000,
      cost_price: 2000,
      items: [
        { flower_id: "flw-1", variety_id: "var-1", color_id: "clr-1", quantity: 5, unit_cost: 400 },
      ],
    })
  })

  it("нормализует отсутствующие сорт и цвет в null и не тащит лишние поля позиции", () => {
    const result = buildRecipePayload({
      name: "Букет",
      style: "",
      assemblyNotes: "",
      comment: "",
      recommendedPrice: 0,
      costPrice: 0,
      items: [{ flower_id: "flw-1", name: "Роза", unit: "шт", quantity: 1, unit_cost: 0 }],
    })

    expect(result.id).toBeUndefined()
    expect(result.items).toEqual([
      { flower_id: "flw-1", variety_id: null, color_id: null, quantity: 1, unit_cost: 0 },
    ])
  })
})

describe("computeRecipeFinance", () => {
  it("считает прибыль и маржу", () => {
    expect(computeRecipeFinance(1200, 4000)).toEqual({ profit: 2800, margin: 70 })
  })

  it("допускает отрицательную прибыль", () => {
    expect(computeRecipeFinance(5000, 1000)).toEqual({ profit: -4000, margin: -400 })
  })

  it("без цены маржа равна нулю, а не делению на ноль", () => {
    expect(computeRecipeFinance(1200, 0)).toEqual({ profit: -1200, margin: 0 })
  })
})
