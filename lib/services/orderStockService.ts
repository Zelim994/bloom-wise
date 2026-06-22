import type { createClient } from "@/lib/supabase/server"

export type OrderStockPlanItem = {
  flower_id: string
  variety_id?: string | null
  color_id?: string | null
  quantity: number
}

export type OrderStockAllocation = {
  flower_id: string
  variety_id?: string | null
  color_id?: string | null
  inventory_item_id: string
  quantity: number
}

// Builds a FIFO allocation plan without writing anything to the database.
// Groups by (flower_id + variety_id + color_id) so Mondial·80 and Mondial·100
// are never mixed together. When variety_id/color_id are null (old orders),
// the query falls back to flower_id only — backward compatible.
export async function buildOrderStockPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  items: OrderStockPlanItem[]
): Promise<{ ok: true; allocations: OrderStockAllocation[] } | { ok: false; error: string }> {
  // Aggregate by (flower_id + variety_id + color_id) to avoid mixing variants
  type GroupKey = string
  type GroupMeta = { flower_id: string; variety_id: string | null; color_id: string | null; quantity: number }

  const needed = new Map<GroupKey, GroupMeta>()
  for (const item of items) {
    if (!item.flower_id || item.quantity <= 0) continue
    const key = `${item.flower_id}:${item.variety_id ?? "none"}:${item.color_id ?? "none"}`
    const prev = needed.get(key)
    if (prev) {
      prev.quantity += item.quantity
    } else {
      needed.set(key, {
        flower_id: item.flower_id,
        variety_id: item.variety_id ?? null,
        color_id: item.color_id ?? null,
        quantity: item.quantity,
      })
    }
  }

  const allocations: OrderStockAllocation[] = []

  for (const [, { flower_id, variety_id, color_id, quantity: totalQty }] of needed.entries()) {
    // Build FIFO query — filter by variety_id/color_id only when provided
    let query = supabase
      .from("inventory_items")
      .select("id, quantity_remaining, arrived_at, created_at")
      .eq("organization_id", organizationId)
      .eq("flower_id", flower_id)
      .gt("quantity_remaining", 0)
      .order("arrived_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })

    if (variety_id) query = query.eq("variety_id", variety_id)
    if (color_id) query = query.eq("color_id", color_id)

    const { data: batches, error } = await query

    if (error) return { ok: false, error: error.message }

    const available = (batches ?? []).reduce((s, b) => s + b.quantity_remaining, 0)
    if (available < totalQty) {
      return {
        ok: false,
        error: `Недостаточно остатков для товара (id: ${flower_id}): нужно ${totalQty}, доступно ${available}`,
      }
    }

    let remaining = totalQty
    for (const batch of batches ?? []) {
      if (remaining <= 0) break
      const take = Math.min(remaining, batch.quantity_remaining)
      allocations.push({
        flower_id,
        variety_id: variety_id ?? null,
        color_id: color_id ?? null,
        inventory_item_id: batch.id,
        quantity: take,
      })
      remaining -= take
    }
  }

  return { ok: true, allocations }
}

// Calls the return_order_stock RPC.
// All actual DB writes happen atomically inside the PostgreSQL function.
export async function returnOrderStockViaRpc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!orderId) return { ok: false, error: "orderId не может быть пустым" }

  const { error } = await supabase.rpc("return_order_stock", {
    p_order_id: orderId,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Calls the write_off_order_stock RPC.
// All actual DB writes happen atomically inside the PostgreSQL function.
// variety_id/color_id in allocations are ignored by the current RPC version
// but kept here for future use when the RPC is extended to log them.
export async function writeOffOrderStockViaRpc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  allocations: OrderStockAllocation[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  // JS-level validation before hitting the DB
  if (!orderId) return { ok: false, error: "orderId не может быть пустым" }
  if (allocations.length === 0) return { ok: false, error: "allocations не может быть пустым" }
  for (const a of allocations) {
    if (!a.flower_id) return { ok: false, error: "flower_id не может быть пустым" }
    if (!a.inventory_item_id) return { ok: false, error: "inventory_item_id не может быть пустым" }
    if (a.quantity <= 0) return { ok: false, error: "quantity должно быть больше 0" }
  }

  // RPC receives only the fields it currently understands; variety_id/color_id are excluded
  // until the RPC is updated to handle them (migration_016).
  const rpcAllocations = allocations.map(({ flower_id, inventory_item_id, quantity }) => ({
    flower_id,
    inventory_item_id,
    quantity,
  }))

  const { error } = await supabase.rpc("write_off_order_stock", {
    p_order_id: orderId,
    p_allocations: rpcAllocations,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
