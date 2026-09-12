// Synthetic two-tenant fixture graph for the local integration suite.
//
// Everything here is created as `postgres`, because this is local test
// administration — creating auth users, organizations and catalog rows is not
// something the application's authenticated API is expected to do. The
// distinction that matters is elsewhere: once these fixtures exist, every
// replace_order_bouquet invocation happens under withAuthenticatedActor, never
// as postgres. See support/db.ts.
//
// All identifiers are unmistakably synthetic and share a fixed prefix so a
// half-finished run is identifiable and cleanable. No production UUID, no real
// name, email or phone number appears anywhere.

import type { Client } from "pg"

/** Shared marker for every row this harness creates. */
export const FIXTURE_PREFIX = "bw-itest"

/** Deterministic synthetic UUIDs — visibly fake, no collision with real data. */
const uuid = (tenant: "a" | "b", kind: string, n = 1) => {
  const kinds: Record<string, string> = {
    user: "0001", org: "0002", flower: "0003", variety: "0004", color: "0005",
    recipe: "0006", order: "0007", bouquet: "0008",
  }
  const t = tenant === "a" ? "aaaa" : "bbbb"
  return `${t}${kinds[kind]}-0000-4000-8000-${String(n).padStart(12, "0")}`
}

export type Tenant = {
  key: "a" | "b"
  userId: string
  orgId: string
  flowerId: string
  varietyId: string
  colorId: string
  recipeId: string
  recipe2Id: string
}

export const TENANT_A: Tenant = {
  key: "a",
  userId: uuid("a", "user"),
  orgId: uuid("a", "org"),
  flowerId: uuid("a", "flower"),
  varietyId: uuid("a", "variety"),
  colorId: uuid("a", "color"),
  recipeId: uuid("a", "recipe", 1),
  recipe2Id: uuid("a", "recipe", 2),
}

export const TENANT_B: Tenant = {
  key: "b",
  userId: uuid("b", "user"),
  orgId: uuid("b", "org"),
  flowerId: uuid("b", "flower"),
  varietyId: uuid("b", "variety"),
  colorId: uuid("b", "color"),
  recipeId: uuid("b", "recipe", 1),
  recipe2Id: uuid("b", "recipe", 2),
}

async function createTenant(client: Client, t: Tenant): Promise<void> {
  // auth.users needs only `id`; the on_auth_user_created trigger then inserts
  // the profiles row (role 'florist', organization_id NULL).
  await client.query(
    `insert into auth.users (id, email) values ($1, $2)`,
    [t.userId, `${FIXTURE_PREFIX}-${t.key}@example.test`],
  )
  await client.query(
    `insert into public.organizations (id, name) values ($1, $2)`,
    [t.orgId, `${FIXTURE_PREFIX} tenant ${t.key.toUpperCase()}`],
  )
  // Bind the trigger-created profile to this tenant.
  await client.query(
    `update public.profiles set organization_id = $1, full_name = $2 where id = $3`,
    [t.orgId, `${FIXTURE_PREFIX} actor ${t.key.toUpperCase()}`, t.userId],
  )
  await client.query(
    `insert into public.flowers (id, organization_id, name) values ($1, $2, $3)`,
    [t.flowerId, t.orgId, `${FIXTURE_PREFIX} flower ${t.key.toUpperCase()}`],
  )
  await client.query(
    `insert into public.flower_varieties (id, flower_id, name) values ($1, $2, $3)`,
    [t.varietyId, t.flowerId, `${FIXTURE_PREFIX} variety`],
  )
  // Flower-level colour (variety_id null), the common catalog shape.
  await client.query(
    `insert into public.flower_colors (id, flower_id, name) values ($1, $2, $3)`,
    [t.colorId, t.flowerId, `${FIXTURE_PREFIX} colour`],
  )
  for (const [id, label] of [[t.recipeId, "recipe 1"], [t.recipe2Id, "recipe 2"]] as const) {
    await client.query(
      `insert into public.recipes (id, organization_id, name) values ($1, $2, $3)`,
      [id, t.orgId, `${FIXTURE_PREFIX} ${label} ${t.key.toUpperCase()}`],
    )
  }
}

export async function createTenants(client: Client): Promise<void> {
  await createTenant(client, TENANT_A)
  await createTenant(client, TENANT_B)
}

export type OrderOptions = {
  status?: string
  stockWrittenOff?: boolean
  costPrice?: number | null
}

/**
 * Creates an order. order_number is deliberately omitted: the
 * orders_assign_order_number BEFORE INSERT trigger owns it, and letting the
 * trigger fill it here also exercises that architecture.
 */
export async function createOrder(
  client: Client,
  t: Tenant,
  id: string,
  opts: OrderOptions = {},
): Promise<string> {
  await client.query(
    `insert into public.orders (id, organization_id, status, stock_written_off, cost_price)
     values ($1, $2, coalesce($3, 'new'), coalesce($4, false), $5)`,
    [id, t.orgId, opts.status ?? null, opts.stockWrittenOff ?? null, opts.costPrice ?? null],
  )
  return id
}

export type BouquetOptions = {
  recipeId?: string | null
  costPrice?: number
  salePrice?: number
  profit?: number
  marginPercent?: number
}

export async function createBouquet(
  client: Client,
  orderId: string,
  id: string,
  opts: BouquetOptions = {},
): Promise<string> {
  await client.query(
    `insert into public.bouquets
       (id, order_id, mode, cost_price, sale_price, profit, margin_percent, is_display, recipe_id)
     values ($1, $2, 'stock_only', $3, $4, $5, $6, false, $7)`,
    [
      id, orderId,
      opts.costPrice ?? 100, opts.salePrice ?? 200,
      opts.profit ?? 100, opts.marginPercent ?? 50,
      opts.recipeId ?? null,
    ],
  )
  return id
}

export async function createBouquetItem(
  client: Client,
  bouquetId: string,
  t: Tenant,
  quantity: number,
  unitCost: number,
): Promise<void> {
  await client.query(
    `insert into public.bouquet_items
       (bouquet_id, flower_id, variety_id, color_id, product_id, quantity, unit_cost, total_cost)
     values ($1, $2, $3, $4, null, $5, $6, $7)`,
    [bouquetId, t.flowerId, t.varietyId, t.colorId, quantity, unitCost, quantity * unitCost],
  )
}

/** A valid p_bouquet payload. */
export const bouquetPayload = (o: Partial<Record<"cost_price" | "sale_price" | "profit" | "margin_percent", number>> & { recipe_id?: string | null } = {}) => ({
  cost_price: o.cost_price ?? 250,
  sale_price: o.sale_price ?? 500,
  profit: o.profit ?? 250,
  margin_percent: o.margin_percent ?? 50,
  ...(o.recipe_id !== undefined ? { recipe_id: o.recipe_id } : {}),
})

/** A valid p_items entry for the given tenant's catalog. */
export const itemPayload = (t: Tenant, quantity: number, unitCost: number) => ({
  flower_id: t.flowerId,
  variety_id: t.varietyId,
  color_id: t.colorId,
  quantity,
  unit_cost: unitCost,
})

/**
 * Deterministic teardown, in explicit dependency order.
 *
 * The FK graph is not uniformly cascading: bouquet_items.flower_id references
 * flowers with NO ACTION, while flowers themselves cascade from organizations.
 * Deleting organizations first therefore tries to remove flowers that surviving
 * bouquet_items still reference. Orders are deleted first so that
 * orders -> bouquets -> bouquet_items (both CASCADE) drains the item rows
 * before their catalog rows disappear.
 *
 * Remaining cascades used here:
 *   organizations -> flowers / recipes / orders   (ON DELETE CASCADE)
 *   orders        -> bouquets                     (ON DELETE CASCADE)
 *   bouquets      -> bouquet_items                (ON DELETE CASCADE)
 *   recipes       -> recipe_items                 (ON DELETE CASCADE)
 *   auth.users    -> profiles                     (ON DELETE CASCADE)
 *
 * No TRUNCATE, no schema reset, no test-only objects.
 */
export async function cleanup(client: Client): Promise<void> {
  const orgs = [TENANT_A.orgId, TENANT_B.orgId]
  await client.query(`delete from public.orders where organization_id = any($1::uuid[])`, [orgs])
  await client.query(`delete from public.organizations where id = any($1::uuid[])`, [orgs])
  await client.query(`delete from auth.users where id = any($1::uuid[])`, [
    [TENANT_A.userId, TENANT_B.userId],
  ])
}
