import type { Json } from "@/lib/supabase/types"
import type { createClient } from "@/lib/supabase/server"

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// ─── RPC wrapper types ────────────────────────────────────────────────────────

// Позиция поставки для передачи в RPC (delivery split считает сам RPC)
export type RpcPurchaseItem = {
  flower_id:   string
  variety_id?: string | null
  color_id?:   string | null
  quantity:    number
  cost_price:  number        // закупочная без доставки
  sale_price?: number | null
  expires_at?: string | null
  comment?:    string | null
}

export type RpcCreatePurchaseParams = {
  supplier_name:   string
  supplier_phone?: string | null
  purchase_date:   string        // YYYY-MM-DD
  comment?:        string | null
  delivery_cost?:  number
  items:           RpcPurchaseItem[]
}

export type RpcCreatePurchaseResult =
  | { ok: true;  purchaseId: string }
  | { ok: false; error: string }

export type BatchDeleteResult = { ok: true } | { ok: false; usedCount: number }

export async function validateAndDeleteInventoryBatch(
  supabase: SupabaseClient,
  inventoryItemId: string
): Promise<BatchDeleteResult> {
  const { data: inv } = await supabase
    .from("inventory_items")
    .select("organization_id, flower_id, quantity_in, quantity_remaining, purchase_id, variety_id, color_id")
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
      variety_id: inv.variety_id ?? null,
      color_id: inv.color_id ?? null,
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

// ─── RPC wrapper ─────────────────────────────────────────────────────────────

/**
 * Calls create_purchase_atomic RPC — single PostgreSQL transaction.
 * Computes delivery split server-side; does NOT write to tables directly.
 * Legacy non-idempotent wrapper, not used by the purchase forms. New saves use savePurchaseViaRpc.
 */
export async function createPurchaseAtomicViaRpc(
  supabase: SupabaseClient,
  params: RpcCreatePurchaseParams
): Promise<RpcCreatePurchaseResult> {
  const { data, error } = await supabase.rpc("create_purchase_atomic", {
    p_supplier_name:  params.supplier_name,
    p_supplier_phone: params.supplier_phone ?? null,
    p_purchase_date:  params.purchase_date,
    p_comment:        params.comment ?? null,
    p_delivery_cost:  params.delivery_cost ?? 0,
    p_items:          params.items,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  const purchaseId = (data as { purchase_id?: string } | null)?.purchase_id
  if (!purchaseId) {
    return { ok: false, error: "RPC не вернула purchase_id" }
  }

  return { ok: true, purchaseId }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Legacy helper; transactional purchase saves resolve suppliers inside SQL.
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

export type PurchaseSaveResult = {error?: string; id?: string; uncertain?: boolean}
const saveMessages: Record<string,string> = {
  BW_AUTH_REQUIRED: 'Войдите в аккаунт салона.',
  BW_INVALID_PURCHASE: 'Проверьте даты, состав и суммы закупки.',
  BW_PURCHASE_UNAVAILABLE: 'Закупка или её позиция недоступна.',
  BW_LEGACY_LINE: 'В закупке есть позиция без товара. Обратитесь к администратору перед изменением закупки.',
  BW_STALE_PURCHASE: 'Состав закупки изменился. Обновите страницу перед сохранением.',
  BW_BATCH_USED: 'Нельзя удалить позицию: партия уже использована.',
  BW_OPERATION_CONFLICT: 'Эта отправка уже сохранена с другими данными. Проверьте закупку перед новой правкой.',
}
export async function savePurchaseViaRpc(supabase: SupabaseClient, operationId: string, purchaseId: string|null, payload: Json): Promise<PurchaseSaveResult> {
  try {
    const {data,error}=await supabase.rpc('save_purchase_atomic',{p_operation_id:operationId,p_purchase_id:purchaseId,p_payload:payload})
    const value=data as {purchase_id?:unknown}|null
    if(!error && typeof value?.purchase_id==='string')return {id:value.purchase_id}
    if(error && (/^[0-9A-Z]{5}$/.test(error.code??'') || error.code?.startsWith('PGRST'))) {
      return {error:saveMessages[error.message]??'Не удалось сохранить закупку. Изменения этой отправки отменены. Проверьте данные.'}
    }
  } catch { /* A transport exception is not evidence of rollback. */ }
  try {
    const {data,error}=await supabase.rpc('purchase_save_status',{p_operation_id:operationId})
    const value=data as {status?:unknown;purchase_id?:unknown}|null
    if(!error && value?.status==='committed' && typeof value.purchase_id==='string')return {id:value.purchase_id}
  } catch { /* Keep the operation ID; never create again with a fresh one. */ }
  return {uncertain:true,error:'Ответ не получен. Проверьте результат отправки перед повторным сохранением.'}
}
