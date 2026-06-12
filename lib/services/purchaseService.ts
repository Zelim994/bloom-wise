import type { createClient } from "@/lib/supabase/server"

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type BatchDeleteResult = { ok: true } | { ok: false; usedCount: number }

export async function validateAndDeleteInventoryBatch(
  supabase: SupabaseClient,
  inventoryItemId: string
): Promise<BatchDeleteResult> {
  const { data: inv } = await supabase
    .from("inventory_items")
    .select("organization_id, flower_id, quantity_in, quantity_remaining, purchase_id")
    .eq("id", inventoryItemId)
    .single()

  // Партия не найдена — считаем уже отменённой
  if (!inv) return { ok: true }

  // Частично использована — нельзя отменить
  if (inv.quantity_remaining < inv.quantity_in) {
    return { ok: false, usedCount: inv.quantity_in - inv.quantity_remaining }
  }

  // Проверяем, существует ли уже компенсационное движение для этой партии.
  // Это защита от двойной компенсации: если предыдущий вызов успешно вставил движение,
  // но не смог обнулить quantity_remaining (UPDATE упал), повторный вызов не создаст второе движение.
  const { data: existing, error: checkErr } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("inventory_item_id", inventoryItemId)
    .eq("movement_type", "purchase_cancelled")
    .limit(1)
    .maybeSingle()

  if (checkErr) {
    console.error("[validateAndDeleteInventoryBatch] stock_movements check:", checkErr.message)
    return { ok: false, usedCount: 0 }
  }

  if (!existing) {
    // Компенсационного движения ещё нет — создаём.
    // stock_movements — append-only лог, поэтому не удаляем, а добавляем отрицательную запись.
    const { error: smErr } = await supabase.from("stock_movements").insert({
      organization_id: inv.organization_id,
      flower_id: inv.flower_id,
      inventory_item_id: inventoryItemId,
      quantity: -inv.quantity_in,
      movement_type: "purchase_cancelled",
      source_type: "purchase",
      source_id: inv.purchase_id ?? null,
      comment: "Отмена позиции прихода",
    })
    if (smErr) {
      console.error("[validateAndDeleteInventoryBatch] stock_movements insert:", smErr.message)
      return { ok: false, usedCount: 0 }
    }
  }

  // Обнуляем остаток вместо удаления партии.
  // FK на stock_movements → inventory_items (ON DELETE NO ACTION) не позволяет удалить партию
  // пока существуют ссылающиеся движения. Обнуление безопасно и фильтруется в запросах (> 0).
  // Операция идемпотентна: повторный UPDATE quantity_remaining = 0 безвреден.
  const { error: invErr } = await supabase
    .from("inventory_items")
    .update({ quantity_remaining: 0 })
    .eq("id", inventoryItemId)
  if (invErr) {
    console.error("[validateAndDeleteInventoryBatch] inventory_items update:", invErr.message)
    return { ok: false, usedCount: 0 }
  }

  return { ok: true }
}

/**
 * Finds an existing supplier by name (case-insensitive) within the organization,
 * or creates a new one. Returns supplierId (null if name is empty) or an error.
 */
export async function findOrCreateSupplier(
  supabase: SupabaseClient,
  orgId: string,
  supplierName: string
): Promise<{ supplierId: string | null; error?: string }> {
  const name = supplierName.trim()
  if (!name) return { supplierId: null }

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("name", name)
    .limit(1)

  if (existing && existing.length > 0) {
    return { supplierId: existing[0].id }
  }

  const { data: newSup, error: supErr } = await supabase
    .from("suppliers")
    .insert({ organization_id: orgId, name, is_active: true })
    .select("id")
    .single()

  if (supErr) return { supplierId: null, error: supErr.message }
  return { supplierId: newSup?.id ?? null }
}
