// RECIPE-SAVE-ATOMIC: upsertRecipe — единственная точка сохранения рецепта.
//
// Вызывается настоящий server action. Проверяется, что сохранение идёт ровно
// одним вызовом save_recipe_atomic (migration_038), что ревалидация случается
// только при подтверждённом id и что невалидный payload отбивается до любого
// обращения к базе.
//
// Отдельно закреплено то, ради чего этап и делался: действие больше НЕ ходит
// в таблицы напрямую (никаких update → delete → insert тремя транзакциями) и
// больше не вычисляет organization_id на клиентской стороне — его выводит сама
// функция из auth.uid().

import { beforeEach, describe, expect, it, vi } from "vitest"

import { createSupabaseMock, type SupabaseMockOptions } from "@/lib/auth/testing/supabaseMock"
import type { RecipePayload } from "@/app/actions/recipes"

const current = vi.hoisted(() => ({
  client: null as unknown,
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => current.client,
}))

vi.mock("next/cache", () => ({
  revalidatePath: current.revalidatePath,
}))

const { upsertRecipe } = await import("@/app/actions/recipes")

const SAVE_FAILED = "Не удалось подтвердить сохранение рецепта. Проверьте список рецептов перед повторной попыткой."

function useSupabase(options: SupabaseMockOptions) {
  const mock = createSupabaseMock(options)
  current.client = mock.client
  return mock
}

/** Мок с успешным сохранением; id ответа можно переопределить. */
function useSavingSupabase(data: unknown = { ok: true, recipe_id: "rec-1", created: true }) {
  return useSupabase({ rpc: { save_recipe_atomic: { data, error: null } } })
}

function payload(overrides: Partial<RecipePayload> = {}): RecipePayload {
  return {
    name: "Нежный рассвет",
    style: "нежный",
    assembly_notes: "Сначала каркас",
    comment: "Для особых случаев",
    recommended_price: 4000,
    cost_price: 1200,
    items: [
      { flower_id: "flw-1", variety_id: "var-1", color_id: "clr-1", quantity: 9, unit_cost: 100 },
      { flower_id: "flw-2", variety_id: null, color_id: null, quantity: 3, unit_cost: 100 },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  current.client = null
  current.revalidatePath.mockReset()
})

describe("upsertRecipe — успешное сохранение", () => {
  it("создаёт рецепт одним вызовом RPC и ревалидирует обе страницы", async () => {
    const mock = useSavingSupabase()

    expect(await upsertRecipe(payload())).toEqual({ id: "rec-1" })

    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(mock.rpc).toHaveBeenCalledWith("save_recipe_atomic", {
      p_recipe_id: null,
      p_recipe: {
        name: "Нежный рассвет",
        style: "нежный",
        assembly_notes: "Сначала каркас",
        comment: "Для особых случаев",
        recommended_price: 4000,
        cost_price: 1200,
      },
      p_items: [
        { flower_id: "flw-1", variety_id: "var-1", color_id: "clr-1", quantity: 9, unit_cost: 100 },
        { flower_id: "flw-2", variety_id: null, color_id: null, quantity: 3, unit_cost: 100 },
      ],
    })
    expect(current.revalidatePath).toHaveBeenCalledWith("/recipes")
    expect(current.revalidatePath).toHaveBeenCalledWith("/recipes/rec-1")
  })

  it("передаёт id существующего рецепта и не создаёт второй", async () => {
    const mock = useSavingSupabase({ ok: true, recipe_id: "rec-7", created: false })

    expect(await upsertRecipe(payload({ id: "rec-7" }))).toEqual({ id: "rec-7" })

    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(mock.rpc.mock.calls[0][1]).toMatchObject({ p_recipe_id: "rec-7" })
  })

  it("ревалидирует тот id, который вернула база, а не присланный клиентом", async () => {
    useSavingSupabase({ ok: true, recipe_id: "rec-real" })

    expect(await upsertRecipe(payload({ id: "rec-7" }))).toEqual({ id: "rec-real" })
    expect(current.revalidatePath).toHaveBeenCalledWith("/recipes/rec-real")
  })

  it("обрезает название и превращает пустые тексты в null", async () => {
    const mock = useSavingSupabase()

    await upsertRecipe(
      payload({ name: "  Пионовый сад  ", style: "", assembly_notes: "", comment: "" }),
    )

    expect(mock.rpc.mock.calls[0][1]).toMatchObject({
      p_recipe: {
        name: "Пионовый сад",
        style: null,
        assembly_notes: null,
        comment: null,
        recommended_price: 4000,
        cost_price: 1200,
      },
    })
  })

  it("нормализует отсутствующие сорт и цвет в null", async () => {
    const mock = useSavingSupabase()

    await upsertRecipe(
      payload({
        items: [{ flower_id: "flw-1", variety_id: null, color_id: null, quantity: 1, unit_cost: 0 }],
      }),
    )

    expect(mock.rpc.mock.calls[0][1]).toMatchObject({
      p_items: [
        { flower_id: "flw-1", variety_id: null, color_id: null, quantity: 1, unit_cost: 0 },
      ],
    })
  })

  it("не трогает таблицы напрямую и не вычисляет организацию на клиенте", async () => {
    const mock = useSavingSupabase()

    await upsertRecipe(payload())

    // Ни одного select/insert/update/delete: весь путь записи — внутри RPC.
    expect(mock.client.from).not.toHaveBeenCalled()
    expect(mock.queries).toEqual([])
    expect(mock.writes).toEqual([])
    // organization_id не входит в аргументы: его выводит сама функция.
    expect(JSON.stringify(mock.rpc.mock.calls[0][1])).not.toContain("organization")
  })

  it("маржу не присылает: она производна и считается в базе", async () => {
    const mock = useSavingSupabase()

    await upsertRecipe(payload())

    expect(JSON.stringify(mock.rpc.mock.calls[0][1])).not.toContain("margin")
  })
})

describe("upsertRecipe — отказ до обращения к базе", () => {
  const rejects: Array<[string, Partial<RecipePayload>, RegExp]> = [
    ["пустое название", { name: "   " }, /Укажите название рецепта/],
    ["пустой состав", { items: [] }, /Добавьте хотя бы один цветок/],
    [
      "нецелое количество",
      { items: [{ flower_id: "f", variety_id: null, color_id: null, quantity: 1.5, unit_cost: 10 }] },
      /Количество в позиции рецепта/,
    ],
    [
      "нулевое количество",
      { items: [{ flower_id: "f", variety_id: null, color_id: null, quantity: 0, unit_cost: 10 }] },
      /Количество в позиции рецепта/,
    ],
    [
      "количество больше int4",
      {
        items: [
          { flower_id: "f", variety_id: null, color_id: null, quantity: 2_147_483_648, unit_cost: 1 },
        ],
      },
      /Количество в позиции рецепта/,
    ],
    [
      "NaN в количестве",
      { items: [{ flower_id: "f", variety_id: null, color_id: null, quantity: NaN, unit_cost: 1 }] },
      /Количество в позиции рецепта/,
    ],
    [
      "позиция без цветка",
      { items: [{ flower_id: "", variety_id: null, color_id: null, quantity: 1, unit_cost: 10 }] },
      /Не удалось определить цветок/,
    ],
    [
      "нечисловая себестоимость позиции",
      {
        items: [
          { flower_id: "f", variety_id: null, color_id: null, quantity: 1, unit_cost: Number.NaN },
        ],
      },
      /Некорректная себестоимость в позиции рецепта/,
    ],
    [
      "отрицательная себестоимость позиции",
      { items: [{ flower_id: "f", variety_id: null, color_id: null, quantity: 1, unit_cost: -1 }] },
      /Себестоимость позиции рецепта не может быть отрицательной/,
    ],
    [
      "себестоимость позиции вне numeric(10,2)",
      {
        items: [
          { flower_id: "f", variety_id: null, color_id: null, quantity: 1, unit_cost: 99_999_999.995 },
        ],
      },
      /Себестоимость позиции рецепта вне допустимого диапазона/,
    ],
    ["нечисловая себестоимость рецепта", { cost_price: Number.POSITIVE_INFINITY }, /Некорректное числовое значение рецепта/],
    ["отрицательная себестоимость рецепта", { cost_price: -1 }, /не могут быть отрицательными/],
    ["отрицательная рекомендуемая цена", { recommended_price: -1 }, /не могут быть отрицательными/],
    [
      "себестоимость рецепта вне numeric(10,2)",
      { cost_price: 99_999_999.995, recommended_price: 0 },
      /Себестоимость рецепта вне допустимого диапазона/,
    ],
    [
      "рекомендуемая цена вне numeric(10,2)",
      { recommended_price: 99_999_999.995, cost_price: 0 },
      /Рекомендуемая цена рецепта вне допустимого диапазона/,
    ],
    [
      "маржа вне numeric(5,2)",
      { cost_price: 100_000, recommended_price: 1 },
      /Маржа рецепта вне допустимого диапазона/,
    ],
  ]

  for (const [label, overrides, message] of rejects) {
    it(`отклоняет ${label} и не вызывает RPC`, async () => {
      const mock = useSavingSupabase()

      const result = await upsertRecipe(payload(overrides))

      expect(result.error).toMatch(message)
      expect(result.id).toBeUndefined()
      expect(mock.rpc).not.toHaveBeenCalled()
      expect(current.revalidatePath).not.toHaveBeenCalled()
    })
  }

  it("пропускает отрицательную прибыль: дешёвая цена при дорогом составе законна", async () => {
    const mock = useSavingSupabase()

    expect(await upsertRecipe(payload({ cost_price: 5000, recommended_price: 1000 }))).toEqual({
      id: "rec-1",
    })
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })

  it("пропускает рецепт без рекомендуемой цены", async () => {
    const mock = useSavingSupabase()

    expect(await upsertRecipe(payload({ recommended_price: 0 }))).toEqual({ id: "rec-1" })
    expect(mock.rpc.mock.calls[0][1]).toMatchObject({ p_recipe: { recommended_price: 0 } })
  })
})

describe("upsertRecipe — неудача базы", () => {
  it("не выпускает сообщение базы наружу и ничего не ревалидирует", async () => {
    useSupabase({
      rpc: {
        save_recipe_atomic: {
          data: null,
          error: { message: 'Цветок не найден или принадлежит другой организации (flower_id=...)' },
        },
      },
    })

    const result = await upsertRecipe(payload())

    expect(result).toEqual({ error: SAVE_FAILED })
    expect(JSON.stringify(result)).not.toContain("flower_id")
    expect(current.revalidatePath).not.toHaveBeenCalled()
  })

  it("считает неудачей отсутствие RPC (не применённая миграция)", async () => {
    // Мок отвечает ошибкой на любой незаданный вызов — как PostgREST на
    // отсутствующую функцию.
    useSupabase({})

    expect(await upsertRecipe(payload())).toEqual({ error: SAVE_FAILED })
    expect(current.revalidatePath).not.toHaveBeenCalled()
  })

  const unconfirmed: Array<[string, unknown]> = [
    ["null вместо объекта", null],
    ["пустой объект", {}],
    ["ok false с id", { ok: false, recipe_id: "rec-1" }],
    ["id без ok", { recipe_id: "rec-1" }],
    ["массив", [{ recipe_id: "rec-1" }]],
    ["нестроковый recipe_id", { ok: true, recipe_id: 42 }],
    ["пустой recipe_id", { ok: true, recipe_id: "" }],
  ]

  for (const [label, data] of unconfirmed) {
    it(`не считает успехом ответ без подтверждённого id (${label})`, async () => {
      useSavingSupabase(data)

      const result = await upsertRecipe(payload())

      expect(result).toEqual({ error: SAVE_FAILED })
      expect(result.id).toBeUndefined()
      expect(current.revalidatePath).not.toHaveBeenCalled()
    })
  }
})


describe("upsertRecipe — database refusal versus transport ambiguity", () => {
  it("reports a known PostgreSQL rollback without leaking details", async () => {
    const error = { code: "P0001", message: "private database details" }
    useSupabase({ rpc: { save_recipe_atomic: { data: null, error } } })
    expect(await upsertRecipe(payload())).toEqual({ error: "Рецепт не сохранён. Проверьте данные и доступ к рецепту." })
    expect(current.revalidatePath).not.toHaveBeenCalled()
  })
  it("a fetch-shaped error does not prove rollback", async () => {
    const error = { code: "", message: "TypeError: fetch failed" }
    useSupabase({ rpc: { save_recipe_atomic: { data: null, error } } })
    expect(await upsertRecipe(payload())).toEqual({ error: SAVE_FAILED })
    expect(current.revalidatePath).not.toHaveBeenCalled()
  })
})
