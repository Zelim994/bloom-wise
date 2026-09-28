// Runtime transaction proof for public.save_recipe_atomic (migration_038).
//
// Same rules as replace_order_bouquet.dbtest.ts, and for the same reasons:
// only the local bloomwise-e2e database is ever touched, every RPC call runs as
// an authenticated actor through withAuthenticatedActor, and each scenario
// rolls its transaction back. The two exceptions are explicit — the injected
// fault scenarios use their own connection and savepoint, and the concurrency
// scenario must commit to prove serialization across two real sessions.
//
// The property under test is the one the old three-request save could not give:
// when the replacing INSERT fails, the recipe's PREVIOUS items must still be
// there, and a failed creation must leave no recipe behind.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Client } from "pg"
import {
  asPgError,
  assertCanonicalLocalDatabase,
  connect,
  withAuthenticatedActor,
} from "./support/db"
import {
  FIXTURE_PREFIX,
  TENANT_A,
  TENANT_B,
  cleanup,
  createTenants,
  itemPayload,
  type Tenant,
} from "./support/fixtures"

const RPC = "select public.save_recipe_atomic($1::uuid, $2::jsonb, $3::jsonb) as result"

/** Recipe ids per scenario. n >= 3: n = 1,2 belong to the shared fixtures. */
const RCP = {
  update: "aaaa0006-0000-4000-8000-000000000003",
  rollback: "aaaa0006-0000-4000-8000-000000000004",
  reject: "aaaa0006-0000-4000-8000-000000000005",
  concurrent: "aaaa0006-0000-4000-8000-000000000006",
  variety: "aaaa0006-0000-4000-8000-000000000007",
} as const

/**
 * Extra catalog rows this suite needs and the shared fixtures do not have: a
 * second variety of tenant A's flower and a colour bound to that variety. Only
 * a variety-specific colour can exercise the "colour belongs to another
 * variety" rule.
 */
const CATALOG = {
  variety2: "aaaa0004-0000-4000-8000-000000000002",
  colorOfVariety2: "aaaa0005-0000-4000-8000-000000000002",
} as const

/** An authenticated uuid with no profile row — an actor without organization. */
const ORGLESS_ACTOR = "aaaa0001-0000-4000-8000-000000000009"

/** Name used only by the failed-creation probe, so its absence is checkable. */
const ORPHAN_PROBE_NAME = `${FIXTURE_PREFIX} orphan probe`

let fixturesOwned = false
let admin: Client
/**
 * Independent read connection. Scenarios drive `admin` inside a transaction
 * that is normally rolled back, so observing there could not tell "the RPC left
 * nothing behind" from "the harness rolled back". Reading here, after the
 * scenario's transaction ended, is what makes the assertion meaningful.
 */
let observer: Client

async function createRecipe(
  client: Client,
  t: Tenant,
  id: string,
  label: string,
  opts: { costPrice?: number; recommendedPrice?: number; marginPercent?: number } = {},
): Promise<string> {
  await client.query(
    `insert into public.recipes
       (id, organization_id, name, style, assembly_notes, comment,
        cost_price, recommended_price, margin_percent)
     values ($1, $2, $3, 'исходный стиль', 'исходная сборка', 'исходный комментарий', $4, $5, $6)`,
    [
      id, t.orgId, `${FIXTURE_PREFIX} ${label} ${t.key.toUpperCase()}`,
      opts.costPrice ?? 100, opts.recommendedPrice ?? 400, opts.marginPercent ?? 75,
    ],
  )
  return id
}

async function createRecipeItem(
  client: Client,
  recipeId: string,
  t: Tenant,
  quantity: number,
  unitCost: number,
): Promise<void> {
  await client.query(
    `insert into public.recipe_items
       (recipe_id, flower_id, variety_id, color_id, product_id, quantity, unit_cost)
     values ($1, $2, $3, $4, null, $5, $6)`,
    [recipeId, t.flowerId, t.varietyId, t.colorId, quantity, unitCost],
  )
}

/**
 * Drains this suite's committed recipe_items before the shared cleanup runs.
 *
 * recipe_items.flower_id references flowers with NO ACTION, while recipes AND
 * flowers both cascade from organizations. Deleting an organization while
 * committed recipe_items still exist can therefore fail, depending on the order
 * PostgreSQL drains the two cascades — the same trap fixtures.ts documents for
 * bouquet_items. No suite committed recipe_items before this one, so the rows
 * are removed here instead of changing shared fixtures.
 */
async function clearRecipeItems(client: Client): Promise<void> {
  await client.query(
    `delete from public.recipe_items ri
      using public.recipes r
      where ri.recipe_id = r.id and r.organization_id = any($1::uuid[])`,
    [[TENANT_A.orgId, TENANT_B.orgId]],
  )
}

/** Committed state of one recipe, read on the observer connection. */
async function observe(recipeId: string) {
  const { rows: recipe } = await observer.query(
    `select * from public.recipes where id = $1`,
    [recipeId],
  )
  const { rows: items } = await observer.query(
    `select *
       from public.recipe_items where recipe_id = $1 order by quantity, unit_cost`,
    [recipeId],
  )
  return { recipe: recipe[0] ?? null, items }
}

/** A valid p_recipe payload. */
const recipePayload = (
  o: Partial<{
    name: string
    style: string | null
    assembly_notes: string | null
    comment: string | null
    cost_price: number
    recommended_price: number | null
  }> = {},
) => ({
  name: o.name ?? `${FIXTURE_PREFIX} saved recipe`,
  style: o.style !== undefined ? o.style : "премиум",
  assembly_notes: o.assembly_notes !== undefined ? o.assembly_notes : "Каркас из зелени",
  comment: o.comment !== undefined ? o.comment : "Комментарий",
  cost_price: o.cost_price ?? 250,
  recommended_price: o.recommended_price !== undefined ? o.recommended_price : 1000,
})

async function callRpc(
  actor: Tenant,
  recipeId: string | null,
  recipe: unknown,
  items: unknown[],
): Promise<{ ok: boolean; recipe_id: string; created: boolean }> {
  return withAuthenticatedActor(admin, actor.userId, actor.orgId, async (ctx) => {
    const { rows } = await ctx.query(RPC, [recipeId, JSON.stringify(recipe), JSON.stringify(items)])
    return rows[0].result
  })
}

beforeAll(async () => {
  admin = await connect()
  observer = await connect()
  await assertCanonicalLocalDatabase(admin)

  // assertCanonicalLocalDatabase knows nothing about migration_038, so the
  // suite states its own precondition instead of failing later in a confusing
  // way. The migration is applied by the coordinator, never from here.
  const { rows: fn } = await admin.query<{ n: string }>(
    `select count(*)::text as n from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'save_recipe_atomic'`,
  )
  if (fn[0].n !== "1") {
    throw new Error(
      "public.save_recipe_atomic is missing — apply migration_038 " +
      "(e2e/supabase/migrations/20260920120000_atomic_recipe_save.sql) first",
    )
  }

  // Clear residue from an earlier interrupted run, items first.
  fixturesOwned = true
  await clearRecipeItems(admin)
  await cleanup(admin)
  await createTenants(admin)

  await admin.query(
    `insert into public.flower_varieties (id, flower_id, name) values ($1, $2, $3)`,
    [CATALOG.variety2, TENANT_A.flowerId, `${FIXTURE_PREFIX} variety 2`],
  )
  await admin.query(
    `insert into public.flower_colors (id, flower_id, variety_id, name) values ($1, $2, $3, $4)`,
    [CATALOG.colorOfVariety2, TENANT_A.flowerId, CATALOG.variety2, `${FIXTURE_PREFIX} colour of variety 2`],
  )

  await createRecipe(admin, TENANT_A, RCP.update, "recipe update")
  await createRecipeItem(admin, RCP.update, TENANT_A, 3, 10)
  await createRecipeItem(admin, RCP.update, TENANT_A, 5, 20)

  await createRecipe(admin, TENANT_A, RCP.rollback, "recipe rollback")
  await createRecipeItem(admin, RCP.rollback, TENANT_A, 7, 11)
  await createRecipeItem(admin, RCP.rollback, TENANT_A, 8, 12)

  await createRecipe(admin, TENANT_A, RCP.reject, "recipe reject")
  await createRecipeItem(admin, RCP.reject, TENANT_A, 4, 9)
  await createRecipeItem(admin, RCP.reject, TENANT_A, 6, 13)

  await createRecipe(admin, TENANT_A, RCP.variety, "recipe variety")
  await createRecipeItem(admin, RCP.variety, TENANT_A, 1, 5)

  await createRecipe(admin, TENANT_A, RCP.concurrent, "recipe concurrent")
  await createRecipeItem(admin, RCP.concurrent, TENANT_A, 2, 7)

  await createRecipeItem(admin, TENANT_B.recipeId, TENANT_B, 9, 13)
})

afterAll(async () => {
  try {
    if (fixturesOwned) {
      await clearRecipeItems(admin)
      await cleanup(admin)
    }
  } finally {
    await Promise.all([admin, observer].filter(Boolean).map((c) => c.end().catch(() => undefined)))
  }
})

describe("save_recipe_atomic — create and update", () => {
  it("S1 creates a recipe with its whole composition in one call", async () => {
    const seen = await withAuthenticatedActor(admin, TENANT_A.userId, TENANT_A.orgId, async (ctx) => {
      const { rows } = await ctx.query(RPC, [
        null,
        JSON.stringify(recipePayload({ name: `${FIXTURE_PREFIX} created`, cost_price: 250 })),
        JSON.stringify([itemPayload(TENANT_A, 2, 30), itemPayload(TENANT_A, 4, 40)]),
      ])
      const result = rows[0].result
      const recipe = await ctx.query(
        `select id, organization_id, name, style, assembly_notes, comment, is_active,
                cost_price::text, recommended_price::text, margin_percent::text
           from public.recipes where id = $1`,
        [result.recipe_id],
      )
      const items = await ctx.query(
        `select flower_id, variety_id, color_id, product_id, quantity, unit_cost::text
           from public.recipe_items where recipe_id = $1 order by quantity`,
        [result.recipe_id],
      )
      return { result, recipe: recipe.rows[0], items: items.rows }
    })

    expect(seen.result.ok).toBe(true)
    expect(seen.result.created).toBe(true)
    expect(seen.recipe.organization_id).toBe(TENANT_A.orgId) // org from auth.uid(), not payload
    expect(seen.recipe.name).toBe(`${FIXTURE_PREFIX} created`)
    expect(seen.recipe.style).toBe("премиум")
    expect(seen.recipe.assembly_notes).toBe("Каркас из зелени")
    expect(seen.recipe.comment).toBe("Комментарий")
    expect(seen.recipe.is_active).toBe(true)
    expect(seen.recipe.cost_price).toBe("250.00")
    expect(seen.recipe.recommended_price).toBe("1000.00")
    expect(seen.recipe.margin_percent).toBe("75.00")      // (1000-250)/1000*100
    expect(seen.items).toEqual([
      {
        flower_id: TENANT_A.flowerId, variety_id: TENANT_A.varietyId, color_id: TENANT_A.colorId,
        product_id: null, quantity: 2, unit_cost: "30.00",
      },
      {
        flower_id: TENANT_A.flowerId, variety_id: TENANT_A.varietyId, color_id: TENANT_A.colorId,
        product_id: null, quantity: 4, unit_cost: "40.00",
      },
    ])

    // The scenario's transaction was rolled back, so nothing survives.
    const { rows: leftovers } = await observer.query<{ n: string }>(
      `select count(*)::text as n from public.recipes where name = $1`,
      [`${FIXTURE_PREFIX} created`],
    )
    expect(leftovers[0].n).toBe("0")
  })

  it("S2 replaces the whole composition and header of an existing recipe", async () => {
    const before = await observe(RCP.update)
    expect(before.items).toHaveLength(2)

    const seen = await withAuthenticatedActor(admin, TENANT_A.userId, TENANT_A.orgId, async (ctx) => {
      const { rows } = await ctx.query(RPC, [
        RCP.update,
        JSON.stringify(recipePayload({ name: "  Обновлённый рецепт  ", cost_price: 500, recommended_price: 2000 })),
        JSON.stringify([itemPayload(TENANT_A, 9, 55)]),
      ])
      const recipe = await ctx.query(
        `select name, cost_price::text, recommended_price::text, margin_percent::text
           from public.recipes where id = $1`,
        [RCP.update],
      )
      const items = await ctx.query(
        `select quantity, unit_cost::text from public.recipe_items where recipe_id = $1`,
        [RCP.update],
      )
      return { result: rows[0].result, recipe: recipe.rows[0], items: items.rows }
    })

    expect(seen.result).toMatchObject({ ok: true, recipe_id: RCP.update, created: false })
    expect(seen.recipe.name).toBe("Обновлённый рецепт")   // trimmed
    expect(seen.recipe.cost_price).toBe("500.00")
    expect(seen.recipe.recommended_price).toBe("2000.00")
    expect(seen.recipe.margin_percent).toBe("75.00")
    expect(seen.items).toEqual([{ quantity: 9, unit_cost: "55.00" }])

    expect(await observe(RCP.update)).toEqual(before)      // rolled back
  })

  it("S3 stores empty header texts as NULL and a zero recommended_price as NULL", async () => {
    const seen = await withAuthenticatedActor(admin, TENANT_A.userId, TENANT_A.orgId, async (ctx) => {
      const { rows } = await ctx.query(RPC, [
        RCP.update,
        JSON.stringify(recipePayload({ style: "", assembly_notes: "", comment: "", recommended_price: 0 })),
        JSON.stringify([itemPayload(TENANT_A, 1, 10)]),
      ])
      const recipe = await ctx.query(
        `select style, assembly_notes, comment, recommended_price, margin_percent
           from public.recipes where id = $1`,
        [rows[0].result.recipe_id],
      )
      return recipe.rows[0]
    })

    expect(seen).toEqual({
      style: null,
      assembly_notes: null,
      comment: null,
      recommended_price: null,
      margin_percent: null,   // no price -> no margin, not a division by zero
    })
  })

  it("S4 accepts an item whose colour is bound to the item's own variety", async () => {
    const result = await callRpc(TENANT_A, RCP.variety, recipePayload(), [
      {
        flower_id: TENANT_A.flowerId,
        variety_id: CATALOG.variety2,
        color_id: CATALOG.colorOfVariety2,
        quantity: 2,
        unit_cost: 15,
      },
    ])
    expect(result).toMatchObject({ ok: true, recipe_id: RCP.variety, created: false })
  })
})

describe("save_recipe_atomic — refusals leave the recipe untouched", () => {
  /**
   * Every refusal must be a controlled domain error raised BEFORE any mutation,
   * never a raw overflow or FK violation discovered at write time. RCP.reject
   * already holds two items, so "nothing moved" is a real assertion.
   */
  const expectRejected = async (recipe: unknown, items: unknown[], expected: RegExp) => {
    const before = await observe(RCP.reject)
    let code: string | undefined
    let message = ""
    try {
      await callRpc(TENANT_A, RCP.reject, recipe, items)
    } catch (error) {
      const e = asPgError(error)
      code = e.code
      message = e.message
    }
    expect(message).toMatch(expected)
    expect(code).not.toBe("22003")                       // not a raw numeric overflow
    expect(message.toLowerCase()).not.toContain("numeric field overflow")
    expect(await observe(RCP.reject)).toEqual(before)
  }

  it("S5 refuses another tenant's recipe id", async () => {
    const before = await observe(TENANT_B.recipeId)
    expect(before.items).toHaveLength(1)
    await expect(
      callRpc(TENANT_A, TENANT_B.recipeId, recipePayload(), [itemPayload(TENANT_A, 1, 10)]),
    ).rejects.toThrow(/Рецепт не найден или недоступен/)
    expect(await observe(TENANT_B.recipeId)).toEqual(before)
  })

  it("S6 refuses a recipe id that does not exist", async () => {
    await expect(
      callRpc(TENANT_A, "aaaa0006-0000-4000-8000-000000000099", recipePayload(), [
        itemPayload(TENANT_A, 1, 10),
      ]),
    ).rejects.toThrow(/Рецепт не найден или недоступен/)
  })

  it("S7 refuses a flower from another organization", async () => {
    await expectRejected(
      recipePayload(),
      [itemPayload(TENANT_B, 1, 10)],
      /Цветок не найден или принадлежит другой организации/,
    )
  })

  it("S8 refuses a variety that does not belong to the item's flower", async () => {
    await expectRejected(
      recipePayload(),
      [{ flower_id: TENANT_A.flowerId, variety_id: TENANT_B.varietyId, color_id: null, quantity: 1, unit_cost: 10 }],
      /Сорт не относится к выбранному цветку/,
    )
  })

  it("S9 refuses a colour that does not belong to the item's flower", async () => {
    await expectRejected(
      recipePayload(),
      [{ flower_id: TENANT_A.flowerId, variety_id: null, color_id: TENANT_B.colorId, quantity: 1, unit_cost: 10 }],
      /Цвет не относится к выбранному цветку/,
    )
  })

  it("S10 refuses a variety-specific colour paired with a different variety", async () => {
    await expectRejected(
      recipePayload(),
      [
        {
          flower_id: TENANT_A.flowerId,
          variety_id: TENANT_A.varietyId,          // variety 1
          color_id: CATALOG.colorOfVariety2,       // colour bound to variety 2
          quantity: 1,
          unit_cost: 10,
        },
      ],
      /Цвет закреплён за другим сортом/,
    )
  })

  it("S10b rejects a variety-bound color with no selected variety", async () => {
    const before = await observe(RCP.reject)
    let failure = ""
    try {
      await callRpc(TENANT_A, RCP.reject, recipePayload(), [
        { ...itemPayload(TENANT_A, 1, 10), variety_id: null, color_id: CATALOG.colorOfVariety2 },
      ])
    } catch (error) { failure = asPgError(error).message }
    expect(failure).toContain("Цвет закреплён")
    expect(await observe(RCP.reject)).toEqual(before)
  })

  it("S11 refuses an empty composition", async () => {
    await expectRejected(recipePayload(), [], /хотя бы одну позицию/)
  })

  it("S12 refuses an item without a flower", async () => {
    await expectRejected(
      recipePayload(),
      [{ flower_id: null, variety_id: null, color_id: null, quantity: 1, unit_cost: 10 }],
      /flower_id обязателен/,
    )
  })

  it("S13 refuses a blank name", async () => {
    await expectRejected(
      recipePayload({ name: "   " }),
      [itemPayload(TENANT_A, 1, 10)],
      /Название рецепта не может быть пустым/,
    )
  })

  // A missing key makes jsonb_typeof return NULL, which would turn a naive
  // `<> 'number'` guard into NULL and skip the IF — the value would then be
  // stored as NULL instead of being refused. These three pin that shut.
  const without = (payload: Record<string, unknown>, key: string): Record<string, unknown> => {
    const copy = { ...payload }
    delete copy[key]
    return copy
  }

  it("S13a refuses a payload with no name at all", async () => {
    await expectRejected(
      without(recipePayload(), "name"),
      [itemPayload(TENANT_A, 1, 10)],
      /name обязателен/,
    )
  })

  it("S13b refuses a payload with no cost_price", async () => {
    await expectRejected(
      without(recipePayload(), "cost_price"),
      [itemPayload(TENANT_A, 1, 10)],
      /cost_price обязателен/,
    )
  })

  it("S13c refuses an item with no quantity or no unit_cost", async () => {
    await expectRejected(
      recipePayload(),
      [{ flower_id: TENANT_A.flowerId, variety_id: null, color_id: null, unit_cost: 10 }],
      /quantity должно быть числом/,
    )
    await expectRejected(
      recipePayload(),
      [{ flower_id: TENANT_A.flowerId, variety_id: null, color_id: null, quantity: 1 }],
      /unit_cost обязателен/,
    )
  })

  const numericRejections: Array<[string, unknown, unknown[], RegExp]> = [
    [
      "S14 a fractional quantity",
      recipePayload(),
      [itemPayload(TENANT_A, 1.5, 10)],
      /quantity должно быть целым числом больше 0/,
    ],
    [
      "S15 a zero quantity",
      recipePayload(),
      [itemPayload(TENANT_A, 0, 10)],
      /quantity должно быть целым числом больше 0/,
    ],
    [
      "S16 a quantity above the integer domain",
      recipePayload(),
      [itemPayload(TENANT_A, 2147483648, 1)],
      /Количество в позиции рецепта вне допустимого диапазона/,
    ],
    [
      "S17 a negative unit_cost",
      recipePayload(),
      [itemPayload(TENANT_A, 1, -1)],
      /Себестоимость позиции рецепта не может быть отрицательной/,
    ],
    [
      "S18 an out-of-range unit_cost",
      recipePayload(),
      [itemPayload(TENANT_A, 1, 1e30)],
      /Себестоимость позиции рецепта вне допустимого диапазона/,
    ],
    [
      "S19 a negative cost_price",
      recipePayload({ cost_price: -1 }),
      [itemPayload(TENANT_A, 1, 10)],
      /Денежные значения рецепта не могут быть отрицательными/,
    ],
    [
      "S20 an out-of-range cost_price",
      recipePayload({ cost_price: 1e30 }),
      [itemPayload(TENANT_A, 1, 10)],
      /Денежное значение рецепта вне допустимого диапазона/,
    ],
    [
      "S21 a margin outside numeric(5,2)",
      recipePayload({ cost_price: 100000, recommended_price: 1 }),
      [itemPayload(TENANT_A, 1, 10)],
      /Маржа рецепта вне допустимого диапазона/,
    ],
  ]

  for (const [label, recipe, items, expected] of numericRejections) {
    it(`${label} is refused before any mutation`, async () => {
      await expectRejected(recipe, items, expected)
    })
  }

  // The measured rounding edge: PostgreSQL rounds to the column scale before
  // checking precision, so these values are storable and must NOT be rejected.
  it("S22 accepts the values PostgreSQL rounds down into range", async () => {
    const result = await callRpc(
      TENANT_A,
      RCP.reject,
      recipePayload({ cost_price: 99999999.994, recommended_price: 99999999.994 }),
      [itemPayload(TENANT_A, 1, 99999999.994)],
    )
    expect(result).toMatchObject({ ok: true, recipe_id: RCP.reject })
  })
})

describe("save_recipe_atomic — actor and privileges", () => {
  it("S23 refuses an authenticated actor without an organization", async () => {
    await expect(
      withAuthenticatedActor(admin, ORGLESS_ACTOR, null, async (ctx) =>
        ctx.query(RPC, [
          null,
          JSON.stringify(recipePayload()),
          JSON.stringify([itemPayload(TENANT_A, 1, 10)]),
        ]),
      ),
    ).rejects.toThrow(/Организация пользователя не найдена/)
  })

  it("S24 denies EXECUTE to anon and grants it to authenticated", async () => {
    const { rows } = await admin.query(
      `select has_function_privilege('authenticated','public.save_recipe_atomic(uuid,jsonb,jsonb)','EXECUTE') as auth,
              has_function_privilege('anon','public.save_recipe_atomic(uuid,jsonb,jsonb)','EXECUTE') as anon`,
    )
    expect(rows[0].auth).toBe(true)
    expect(rows[0].anon).toBe(false)

    const before = await observe(RCP.reject)
    await admin.query("begin")
    let code: string | undefined
    try {
      await admin.query("set local role anon")
      await admin.query(RPC, [
        RCP.reject,
        JSON.stringify(recipePayload()),
        JSON.stringify([itemPayload(TENANT_A, 1, 10)]),
      ])
    } catch (error) {
      code = asPgError(error).code
    } finally {
      await admin.query("rollback").catch(() => undefined)
    }
    expect(code).toBe("42501")                            // insufficient_privilege
    expect(await observe(RCP.reject)).toEqual(before)
  })
})

/**
 * Forced failure AFTER the destructive step.
 *
 * A test-only BEFORE INSERT trigger on recipe_items raises as soon as the
 * replacing INSERT is attempted. The trigger also reports how many rows the
 * recipe still has at that moment: reaching it with a count of 0 is the proof
 * that the DELETE had already run, i.e. the failure really is post-deletion and
 * not a pre-flight rejection.
 *
 * The savepoint is taken BEFORE the fault objects are created, so rolling back
 * to it removes them together with everything the RPC did. Nothing is left to
 * drop, and a crashed process rolls back on disconnect.
 */
describe("save_recipe_atomic — rollback after the deletion", () => {
  const SENTINEL = "BW_ITEST_RECIPE_POST_DELETE_FAULT"

  async function withInsertFault(body: (fault: Client) => Promise<void>): Promise<void> {
    const fault = await connect()
    try {
      await fault.query("begin")
      await fault.query("savepoint bw_recipe_fault")
      await fault.query(`
        create function public.bw_itest_recipe_fault() returns trigger
        language plpgsql as $fn$
        declare
          v_remaining integer;
        begin
          select count(*) into v_remaining
            from public.recipe_items where recipe_id = NEW.recipe_id;
          raise exception '${SENTINEL}:%', v_remaining;
        end;
        $fn$`)
      await fault.query(`
        create trigger bw_itest_recipe_fault
          before insert on public.recipe_items
          for each row execute function public.bw_itest_recipe_fault()`)

      await fault.query("select set_config('request.jwt.claim.sub', $1, true)", [TENANT_A.userId])
      await fault.query("set local role authenticated")
      const { rows: who } = await fault.query<{ who: string; uid: string; org: string }>(
        "select current_user as who, auth.uid()::text as uid, public.get_user_organization_id()::text as org",
      )
      expect(who[0]).toEqual({ who: "authenticated", uid: TENANT_A.userId, org: TENANT_A.orgId })

      await body(fault)

      await fault.query("rollback to savepoint bw_recipe_fault")
      await fault.query("commit")
    } finally {
      await fault.query("rollback").catch(() => undefined)
      await fault.end().catch(() => undefined)
    }
  }

  async function expectNoFaultLeftovers(): Promise<void> {
    const { rows } = await observer.query<{ fns: string; trgs: string }>(`
      select
        (select count(*)::text from pg_proc
          where proname = 'bw_itest_recipe_fault')                       as fns,
        (select count(*)::text from pg_trigger
          where tgname = 'bw_itest_recipe_fault')                        as trgs`)
    expect(rows[0]).toEqual({ fns: "0", trgs: "0" })
  }

  it("S25 keeps the previous items and header when the replacing INSERT fails", async () => {
    const before = await observe(RCP.rollback)
    expect(before.items).toHaveLength(2)

    let message = ""
    await withInsertFault(async (fault) => {
      try {
        // Valid under every rule the function checks: the only thing that can
        // fail is the injected trigger, and only once the INSERT is reached.
        await fault.query(RPC, [
          RCP.rollback,
          JSON.stringify(recipePayload({ name: `${FIXTURE_PREFIX} never saved`, cost_price: 777 })),
          JSON.stringify([itemPayload(TENANT_A, 1, 10)]),
        ])
      } catch (error) {
        message = asPgError(error).message
      }
    })

    // ":0" — the old items were already deleted when the INSERT was attempted.
    expect(message).toContain(`${SENTINEL}:0`)

    const after = await observe(RCP.rollback)
    expect(after.items).toEqual(before.items)       // OLD COMPOSITION SURVIVED
    expect(after.recipe).toEqual(before.recipe)     // header untouched too
    await expectNoFaultLeftovers()
  })

  it("S26 leaves no recipe behind when creation fails after the header insert", async () => {
    let message = ""
    await withInsertFault(async (fault) => {
      try {
        await fault.query(RPC, [
          null,
          JSON.stringify(recipePayload({ name: ORPHAN_PROBE_NAME })),
          JSON.stringify([itemPayload(TENANT_A, 1, 10)]),
        ])
      } catch (error) {
        message = asPgError(error).message
      }
    })

    expect(message).toContain(SENTINEL)

    const { rows } = await observer.query<{ n: string }>(
      `select count(*)::text as n from public.recipes where name = $1`,
      [ORPHAN_PROBE_NAME],
    )
    expect(rows[0].n).toBe("0")                     // no headless recipe
    await expectNoFaultLeftovers()
  })
})

describe("save_recipe_atomic — concurrent serialization", () => {
  it("S27 serializes two sessions on the recipe row and keeps one whole composition", async () => {
    const s1 = await connect()
    const s2 = await connect()
    const watcher = await connect()
    try {
      // ---- session 1: call the RPC, then hold the transaction open ----------
      await s1.query("begin")
      await s1.query("select set_config('request.jwt.claim.sub', $1, true)", [TENANT_A.userId])
      await s1.query("set local role authenticated")
      await s1.query(RPC, [
        RCP.concurrent,
        JSON.stringify(recipePayload({ name: `${FIXTURE_PREFIX} first writer`, cost_price: 111 })),
        JSON.stringify([itemPayload(TENANT_A, 1, 10), itemPayload(TENANT_A, 2, 20)]),
      ])
      const pid1 = (await s1.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid

      // ---- session 2: same recipe, must block on the FOR UPDATE row lock ----
      await s2.query("begin")
      await s2.query("select set_config('request.jwt.claim.sub', $1, true)", [TENANT_A.userId])
      await s2.query("set local role authenticated")
      const pid2 = (await s2.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid

      let s2Settled = false
      const s2Call = s2
        .query(RPC, [
          RCP.concurrent,
          JSON.stringify(recipePayload({ name: `${FIXTURE_PREFIX} second writer`, cost_price: 222 })),
          JSON.stringify([itemPayload(TENANT_A, 3, 30)]),
        ])
        .then((r) => { s2Settled = true; return r })

      // Prove blocking from pg_locks, not from elapsed time.
      let blockers: number[] = []
      for (let i = 0; i < 100 && !blockers.includes(pid1); i++) {
        const { rows } = await watcher.query<{ pids: number[] }>(
          "select pg_blocking_pids($1) as pids", [pid2],
        )
        blockers = rows[0].pids ?? []
        if (!blockers.includes(pid1)) await new Promise((r) => setTimeout(r, 50))
      }
      expect(blockers).toContain(pid1)
      expect(s2Settled).toBe(false)        // still waiting while S1 holds the lock

      // ---- release ---------------------------------------------------------
      await s1.query("commit")
      await s2Call                          // unblocks
      await s2.query("commit")

      const { rows: recipe } = await watcher.query(
        `select name, cost_price::text from public.recipes where id = $1`, [RCP.concurrent],
      )
      const { rows: items } = await watcher.query(
        `select quantity, unit_cost::text from public.recipe_items
          where recipe_id = $1 order by quantity`,
        [RCP.concurrent],
      )

      // Exactly one composition, whole, and the header that came with it — no
      // interleaving of the two writers' items.
      expect(items).toEqual([{ quantity: 3, unit_cost: "30.00" }])
      expect(recipe[0].name).toBe(`${FIXTURE_PREFIX} second writer`)
      expect(recipe[0].cost_price).toBe("222.00")
    } finally {
      await s1.query("rollback").catch(() => undefined)
      await s2.query("rollback").catch(() => undefined)
      await Promise.all([s1.end(), s2.end(), watcher.end()].map((p) => p.catch(() => undefined)))
    }
  })
})
