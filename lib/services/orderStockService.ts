import type { createClient } from "@/lib/supabase/server"

export type OrderStockPlanItem = {
  flower_id: string
  quantity: number
}

export type OrderStockAllocation = {
  flower_id: string
  inventory_item_id: string
  quantity: number
}

// Builds a FIFO allocation plan without writing anything to the database.
export async function buildOrderStockPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  items: OrderStockPlanItem[]
): Promise<{ ok: true; allocations: OrderStockAllocation[] } | { ok: false; error: string }> {
  // Aggregate duplicate flower_ids
  const needed = new Map<string, number>()
  for (const item of items) {
    if (!item.flower_id || item.quantity <= 0) continue
    needed.set(item.flower_id, (needed.get(item.flower_id) ?? 0) + item.quantity)
  }

  const allocations: OrderStockAllocation[] = []

  for (const [flower_id, totalQty] of needed.entries()) {
    // Fetch available batches in FIFO order
    const { data: batches, error } = await supabase
      .from("inventory_items")
      .select("id, quantity_remaining, arrived_at, created_at")
      .eq("organization_id", organizationId)
      .eq("flower_id", flower_id)
      .gt("quantity_remaining", 0)
      .order("arrived_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })

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
      allocations.push({ flower_id, inventory_item_id: batch.id, quantity: take })
      remaining -= take
    }
  }

  return { ok: true, allocations }
}

// Calls the write_off_order_stock RPC.
// All actual DB writes happen atomically inside the PostgreSQL function.
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

  const { error } = await supabase.rpc("write_off_order_stock", {
    p_order_id: orderId,
    p_allocations: allocations,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
