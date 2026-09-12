// Runtime transaction proof for public.replace_order_bouquet.
//
// Everything runs against the local bloomwise-e2e database only. Each scenario
// invokes the RPC as an authenticated actor and rolls its transaction back, so
// scenarios cannot contaminate one another. The single exception is the
// concurrency scenario, which must commit to prove serialization across two
// real sessions — it cleans up after itself.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Client } from "pg"
import {
  asPgError,
  assertCanonicalLocalDatabase,
  connect,
  withAuthenticatedActor,
} from "./support/db"
import {
  TENANT_A,
  TENANT_B,
  bouquetPayload,
  cleanup,
  createBouquet,
  createBouquetItem,
  createOrder,
  createTenants,
  itemPayload,
  type Tenant,
} from "./support/fixtures"

const RPC = "select public.replace_order_bouquet($1::uuid, $2::jsonb, $3::jsonb) as result"

/** Order ids per scenario, kept distinct so nothing overlaps. */
const ORDER = {
  success: "aaaa0007-0000-4000-8000-000000000001",
  rollback: "aaaa0007-0000-4000-8000-000000000002",
  cancelled: "aaaa0007-0000-4000-8000-000000000003",
  writtenOff: "aaaa0007-0000-4000-8000-000000000004",
  recipe: "aaaa0007-0000-4000-8000-000000000005",
  newRecipe: "aaaa0007-0000-4000-8000-000000000006",
  foreignRecipe: "aaaa0007-0000-4000-8000-000000000007",
  multi: "aaaa0007-0000-4000-8000-000000000008",
  emptyExisting: "aaaa0007-0000-4000-8000-000000000009",
  emptyNone: "aaaa0007-0000-4000-8000-000000000010",
  acl: "aaaa0007-0000-4000-8000-000000000011",
  concurrent: "aaaa0007-0000-4000-8000-000000000012",
  tenantB: "bbbb0007-0000-4000-8000-000000000001",
} as const

const BQ = {
  success: "aaaa0008-0000-4000-8000-000000000001",
  rollback: "aaaa0008-0000-4000-8000-000000000002",
  recipe: "aaaa0008-0000-4000-8000-000000000003",
  multi1: "aaaa0008-0000-4000-8000-000000000004",
  multi2: "aaaa0008-0000-4000-8000-000000000005",
  emptyExisting: "aaaa0008-0000-4000-8000-000000000006",
  tenantB: "bbbb0008-0000-4000-8000-000000000001",
} as const

let admin: Client

/** Reads persisted state through a connection that is NOT the actor's. */
async function observe(orderId: string) {
  const { rows: bouquets } = await admin.query(
    `select id, cost_price::text, sale_price::text, profit::text, margin_percent::text, recipe_id
       from public.bouquets where order_id = $1 order by id`,
    [orderId],
  )
  const { rows: items } = await admin.query(
    `select bi.bouquet_id, bi.flower_id, bi.variety_id, bi.color_id,
            bi.quantity, bi.unit_cost::text, bi.total_cost::text
       from public.bouquet_items bi
       join public.bouquets b on b.id = bi.bouquet_id
      where b.order_id = $1 order by bi.quantity, bi.unit_cost`,
    [orderId],
  )
  const { rows: order } = await admin.query(
    `select cost_price::text, status, stock_written_off from public.orders where id = $1`,
    [orderId],
  )
  return { bouquets, items, order: order[0] }
}

async function callRpc(
  actor: Tenant,
  orderId: string,
  bouquet: unknown,
  items: unknown[],
): Promise<{ ok: boolean; bouquet_id: string | null }> {
  return withAuthenticatedActor(admin, actor.userId, actor.orgId, async (ctx) => {
    const { rows } = await ctx.query(RPC, [orderId, JSON.stringify(bouquet), JSON.stringify(items)])
    return rows[0].result
  })
}

beforeAll(async () => {
  admin = await connect()
  await assertCanonicalLocalDatabase(admin)
  await cleanup(admin) // clear any residue from an earlier interrupted run
  await createTenants(admin)

  await createOrder(admin, TENANT_A, ORDER.success, { costPrice: 100 })
  await createBouquet(admin, ORDER.success, BQ.success, { recipeId: TENANT_A.recipeId })
  await createBouquetItem(admin, BQ.success, TENANT_A, 3, 10)
  await createBouquetItem(admin, BQ.success, TENANT_A, 5, 20)

  await createOrder(admin, TENANT_A, ORDER.rollback, { costPrice: 100 })
  await createBouquet(admin, ORDER.rollback, BQ.rollback, { recipeId: TENANT_A.recipeId })
  await createBouquetItem(admin, BQ.rollback, TENANT_A, 7, 11)

  await createOrder(admin, TENANT_A, ORDER.cancelled, { status: "cancelled", costPrice: 100 })
  await createOrder(admin, TENANT_A, ORDER.writtenOff, { stockWrittenOff: true, costPrice: 100 })

  await createOrder(admin, TENANT_A, ORDER.recipe, { costPrice: 100 })
  await createBouquet(admin, ORDER.recipe, BQ.recipe, { recipeId: TENANT_A.recipeId })
  await createBouquetItem(admin, BQ.recipe, TENANT_A, 2, 15)

  await createOrder(admin, TENANT_A, ORDER.newRecipe)
  await createOrder(admin, TENANT_A, ORDER.foreignRecipe)

  await createOrder(admin, TENANT_A, ORDER.multi, { costPrice: 100 })
  await createBouquet(admin, ORDER.multi, BQ.multi1)
  await createBouquet(admin, ORDER.multi, BQ.multi2)
  await createBouquetItem(admin, BQ.multi1, TENANT_A, 1, 5)
  await createBouquetItem(admin, BQ.multi2, TENANT_A, 2, 6)

  await createOrder(admin, TENANT_A, ORDER.emptyExisting, { costPrice: 100 })
  await createBouquet(admin, ORDER.emptyExisting, BQ.emptyExisting, { recipeId: TENANT_A.recipeId })
  await createBouquetItem(admin, BQ.emptyExisting, TENANT_A, 4, 9)

  await createOrder(admin, TENANT_A, ORDER.emptyNone)
  await createOrder(admin, TENANT_A, ORDER.acl)
  await createOrder(admin, TENANT_A, ORDER.concurrent)

  await createOrder(admin, TENANT_B, ORDER.tenantB, { costPrice: 777 })
  await createBouquet(admin, ORDER.tenantB, BQ.tenantB, { recipeId: TENANT_B.recipeId })
  await createBouquetItem(admin, BQ.tenantB, TENANT_B, 9, 13)
})

afterAll(async () => {
  // Only clean up when nothing failed; a failed run keeps its evidence.
  const failed = Boolean((globalThis as { __bwSuiteFailed?: boolean }).__bwSuiteFailed)
  if (!failed) await cleanup(admin)
  await admin.end()
})

describe("replace_order_bouquet — local transaction proof", () => {
  it("S1 replaces an existing bouquet atomically", async () => {
    const before = await observe(ORDER.success)
    expect(before.items).toHaveLength(2)

    const result = await withAuthenticatedActor(admin, TENANT_A.userId, TENANT_A.orgId, async (ctx) => {
      const { rows } = await ctx.query(RPC, [
        ORDER.success,
        JSON.stringify(bouquetPayload({ cost_price: 250 })),
        JSON.stringify([itemPayload(TENANT_A, 2, 30), itemPayload(TENANT_A, 4, 40)]),
      ])
      // assert inside the same transaction, before rollback
      const state = await ctx.query(
        `select b.id, b.cost_price::text, b.sale_price::text, b.profit::text,
                b.margin_percent::text, b.recipe_id, o.cost_price::text as order_cost
           from public.bouquets b join public.orders o on o.id = b.order_id
          where b.order_id = $1`,
        [ORDER.success],
      )
      const items = await ctx.query(
        `select bi.quantity, bi.unit_cost::text, bi.total_cost::text
           from public.bouquet_items bi join public.bouquets b on b.id = bi.bouquet_id
          where b.order_id = $1 order by bi.quantity`,
        [ORDER.success],
      )
      return { rpc: rows[0].result, state: state.rows, items: items.rows }
    })

    expect(result.rpc.ok).toBe(true)
    expect(result.rpc.bouquet_id).toBe(BQ.success)
    expect(result.state).toHaveLength(1)
    const b = result.state[0]
    expect(b.id).toBe(BQ.success)                       // same bouquet row
    expect(b.cost_price).toBe("250.00")
    expect(b.sale_price).toBe("500.00")
    expect(b.profit).toBe("250.00")
    expect(b.margin_percent).toBe("50.00")
    expect(b.recipe_id).toBe(TENANT_A.recipeId)         // provenance untouched
    expect(b.order_cost).toBe("250.00")
    expect(result.items).toEqual([
      { quantity: 2, unit_cost: "30.00", total_cost: "60.00" },
      { quantity: 4, unit_cost: "40.00", total_cost: "160.00" },
    ])

    const after = await observe(ORDER.success)          // rolled back
    expect(after.items).toHaveLength(2)
    expect(after.items.map((i) => i.quantity).sort()).toEqual([3, 5])
  })

  it("S2 rolls back the item DELETE when the replacement INSERT fails", async () => {
    const before = await observe(ORDER.rollback)
    expect(before.items).toHaveLength(1)

    let code: string | undefined
    let message = ""
    try {
      await callRpc(TENANT_A, ORDER.rollback, bouquetPayload({ cost_price: 300 }), [
        // valid for every validation rule, but quantity * unit_cost overflows
        // bouquet_items.total_cost numeric(10,2) at INSERT time — i.e. AFTER
        // the header UPDATE and the DELETE of the old items.
        itemPayload(TENANT_A, 2, 99999999.99),
      ])
    } catch (error) {
      const e = asPgError(error)
      code = e.code
      message = e.message
    }

    expect(code).toBe("22003")                          // numeric_value_out_of_range
    expect(message.toLowerCase()).toContain("numeric field overflow")

    const after = await observe(ORDER.rollback)
    expect(after.bouquets).toHaveLength(1)
    expect(after.bouquets[0]).toEqual(before.bouquets[0])   // header + recipe_id
    expect(after.items).toEqual(before.items)              // OLD ITEMS SURVIVED
    expect(after.order.cost_price).toBe(before.order.cost_price)
  })

  it("S3 refuses another tenant's order", async () => {
    const before = await observe(ORDER.tenantB)
    await expect(
      callRpc(TENANT_A, ORDER.tenantB, bouquetPayload(), [itemPayload(TENANT_A, 1, 10)]),
    ).rejects.toThrow(/Заказ не найден или недоступен/)
    expect(await observe(ORDER.tenantB)).toEqual(before)
  })

  it("S4 refuses a cancelled order", async () => {
    const before = await observe(ORDER.cancelled)
    await expect(
      callRpc(TENANT_A, ORDER.cancelled, bouquetPayload(), [itemPayload(TENANT_A, 1, 10)]),
    ).rejects.toThrow(/Отменённый заказ нельзя редактировать/)
    expect(await observe(ORDER.cancelled)).toEqual(before)
  })

  it("S5 refuses an order whose stock is written off", async () => {
    const before = await observe(ORDER.writtenOff)
    await expect(
      callRpc(TENANT_A, ORDER.writtenOff, bouquetPayload(), [itemPayload(TENANT_A, 1, 10)]),
    ).rejects.toThrow(/Нельзя изменить заказ после списания склада/)
    expect(await observe(ORDER.writtenOff)).toEqual(before)
  })

  it("S6 never overwrites recipe_id on an existing bouquet", async () => {
    for (const supplied of [TENANT_A.recipe2Id, null]) {
      const recipeAfter = await withAuthenticatedActor(
        admin, TENANT_A.userId, TENANT_A.orgId,
        async (ctx) => {
          await ctx.query(RPC, [
            ORDER.recipe,
            JSON.stringify(bouquetPayload({ recipe_id: supplied } as never)),
            JSON.stringify([itemPayload(TENANT_A, 1, 12)]),
          ])
          const { rows } = await ctx.query(
            `select recipe_id from public.bouquets where order_id = $1`, [ORDER.recipe],
          )
          return rows[0].recipe_id
        },
      )
      expect(recipeAfter).toBe(TENANT_A.recipeId)
    }
  })

  it("S7 stores an own-organization recipe on a newly created bouquet", async () => {
    const seen = await withAuthenticatedActor(admin, TENANT_A.userId, TENANT_A.orgId, async (ctx) => {
      const { rows } = await ctx.query(RPC, [
        ORDER.newRecipe,
        JSON.stringify(bouquetPayload({ recipe_id: TENANT_A.recipeId } as never)),
        JSON.stringify([itemPayload(TENANT_A, 2, 25)]),
      ])
      const state = await ctx.query(
        `select id, recipe_id from public.bouquets where order_id = $1`, [ORDER.newRecipe],
      )
      return { rpc: rows[0].result, rows: state.rows }
    })
    expect(seen.rpc.ok).toBe(true)
    expect(seen.rows).toHaveLength(1)
    expect(seen.rows[0].recipe_id).toBe(TENANT_A.recipeId)
    expect(seen.rpc.bouquet_id).toBe(seen.rows[0].id)
  })

  it("S8 silently drops a foreign recipe instead of attaching it", async () => {
    const seen = await withAuthenticatedActor(admin, TENANT_A.userId, TENANT_A.orgId, async (ctx) => {
      const { rows } = await ctx.query(RPC, [
        ORDER.foreignRecipe,
        JSON.stringify(bouquetPayload({ recipe_id: TENANT_B.recipeId } as never)),
        JSON.stringify([itemPayload(TENANT_A, 1, 15)]),
      ])
      const state = await ctx.query(
        `select recipe_id from public.bouquets where order_id = $1`, [ORDER.foreignRecipe],
      )
      return { rpc: rows[0].result, recipe: state.rows[0].recipe_id }
    })
    expect(seen.rpc.ok).toBe(true)       // no exception merely because it is foreign
    expect(seen.recipe).toBeNull()       // and it is NOT attached
  })

  it("S9 fails closed when the order has more than one bouquet", async () => {
    const before = await observe(ORDER.multi)
    expect(before.bouquets).toHaveLength(2)
    await expect(
      callRpc(TENANT_A, ORDER.multi, bouquetPayload(), [itemPayload(TENANT_A, 1, 10)]),
    ).rejects.toThrow(/несколько букетов/)
    const after = await observe(ORDER.multi)
    expect(after.bouquets).toHaveLength(2)
    expect(after).toEqual(before)        // nothing chosen, nothing deleted
  })

  it("S10 clears items but keeps the bouquet when p_items is empty", async () => {
    const seen = await withAuthenticatedActor(admin, TENANT_A.userId, TENANT_A.orgId, async (ctx) => {
      const { rows } = await ctx.query(RPC, [
        ORDER.emptyExisting, JSON.stringify(bouquetPayload({ cost_price: 42 })), JSON.stringify([]),
      ])
      const b = await ctx.query(
        `select b.id, b.cost_price::text, b.recipe_id, o.cost_price::text as order_cost
           from public.bouquets b join public.orders o on o.id = b.order_id where b.order_id = $1`,
        [ORDER.emptyExisting],
      )
      const items = await ctx.query(
        `select count(*)::int as n from public.bouquet_items bi
           join public.bouquets b on b.id = bi.bouquet_id where b.order_id = $1`,
        [ORDER.emptyExisting],
      )
      return { rpc: rows[0].result, b: b.rows[0], items: items.rows[0].n }
    })
    expect(seen.rpc.ok).toBe(true)
    expect(seen.b.id).toBe(BQ.emptyExisting)       // bouquet survives
    expect(seen.b.cost_price).toBe("42.00")
    expect(seen.b.recipe_id).toBe(TENANT_A.recipeId)
    expect(seen.b.order_cost).toBe("42.00")
    expect(seen.items).toBe(0)                     // items cleared
  })

  it("S11 creates no bouquet when there is none and p_items is empty", async () => {
    const seen = await withAuthenticatedActor(admin, TENANT_A.userId, TENANT_A.orgId, async (ctx) => {
      const { rows } = await ctx.query(RPC, [
        ORDER.emptyNone, JSON.stringify(bouquetPayload({ cost_price: 17 })), JSON.stringify([]),
      ])
      const b = await ctx.query(`select count(*)::int as n from public.bouquets where order_id = $1`, [ORDER.emptyNone])
      const o = await ctx.query(`select cost_price::text from public.orders where id = $1`, [ORDER.emptyNone])
      return { rpc: rows[0].result, bouquets: b.rows[0].n, cost: o.rows[0].cost_price }
    })
    expect(seen.rpc.ok).toBe(true)
    expect(seen.rpc.bouquet_id).toBeNull()
    expect(seen.bouquets).toBe(0)
    expect(seen.cost).toBe("17.00")
  })

  it("S13 denies EXECUTE to anon and grants it to authenticated", async () => {
    const { rows } = await admin.query(
      `select has_function_privilege('authenticated','public.replace_order_bouquet(uuid,jsonb,jsonb)','EXECUTE') as auth,
              has_function_privilege('anon','public.replace_order_bouquet(uuid,jsonb,jsonb)','EXECUTE') as anon`,
    )
    expect(rows[0].auth).toBe(true)
    expect(rows[0].anon).toBe(false)

    await admin.query("begin")
    let code: string | undefined
    try {
      await admin.query("set local role anon")
      await admin.query(RPC, [ORDER.acl, JSON.stringify(bouquetPayload()), JSON.stringify([])])
    } catch (error) {
      code = asPgError(error).code
    } finally {
      await admin.query("rollback").catch(() => undefined)
    }
    expect(code).toBe("42501")                     // insufficient_privilege
    expect((await observe(ORDER.acl)).bouquets).toHaveLength(0)
  })
})

describe("replace_order_bouquet — concurrent serialization", () => {
  it("S12 serializes two sessions on the order row and leaves exactly one bouquet", async () => {
    const s1 = await connect()
    const s2 = await connect()
    const watcher = await connect()
    try {
      // ---- session 1: call the RPC, then hold the transaction open ----------
      await s1.query("begin")
      await s1.query("select set_config('request.jwt.claim.sub', $1, true)", [TENANT_A.userId])
      await s1.query("set local role authenticated")
      await s1.query(RPC, [
        ORDER.concurrent,
        JSON.stringify(bouquetPayload({ cost_price: 111 })),
        JSON.stringify([itemPayload(TENANT_A, 1, 10)]),
      ])
      const pid1 = (await s1.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid

      // ---- session 2: same order, must block on the FOR UPDATE row lock ----
      await s2.query("begin")
      await s2.query("select set_config('request.jwt.claim.sub', $1, true)", [TENANT_A.userId])
      await s2.query("set local role authenticated")
      const pid2 = (await s2.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid

      let s2Settled = false
      const s2Call = s2
        .query(RPC, [
          ORDER.concurrent,
          JSON.stringify(bouquetPayload({ cost_price: 222 })),
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

      const { rows: bouquets } = await watcher.query(
        `select id, cost_price::text from public.bouquets where order_id = $1`, [ORDER.concurrent],
      )
      expect(bouquets).toHaveLength(1)      // no duplicate despite no UNIQUE(order_id)
      expect(bouquets[0].cost_price).toBe("222.00")   // serialized second save wins

      const { rows: items } = await watcher.query(
        `select bi.quantity, bi.unit_cost::text from public.bouquet_items bi
           join public.bouquets b on b.id = bi.bouquet_id where b.order_id = $1`,
        [ORDER.concurrent],
      )
      expect(items).toEqual([{ quantity: 3, unit_cost: "30.00" }])

      const { rows: order } = await watcher.query(
        `select cost_price::text from public.orders where id = $1`, [ORDER.concurrent],
      )
      expect(order[0].cost_price).toBe("222.00")
    } finally {
      await s1.query("rollback").catch(() => undefined)
      await s2.query("rollback").catch(() => undefined)
      await Promise.all([s1.end(), s2.end(), watcher.end()].map((p) => p.catch(() => undefined)))
    }
  })
})
