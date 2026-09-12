"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Order, Customer } from "@/lib/supabase/types"
import { getOrgId } from "@/lib/services/organizationService"
import { buildOrderStockPlan, writeOffOrderStockViaRpc, returnOrderStockViaRpc } from "@/lib/services/orderStockService"
import { validateBouquetItems, type NormalizedBouquetItem } from "@/lib/orders/bouquetItems"

export type BouquetItemForEdit = {
  flower_id: string
  variety_id?: string | null
  color_id?: string | null
  quantity: number
  unit_cost: number
}

export type OrderWithCustomer = Order & {
  customers: { full_name: string; phone: string | null } | null
  bouquet?: {
    id: string
    cost_price: number | null
    sale_price: number | null
    profit: number | null
    margin_percent: number | null
    items: BouquetItemForEdit[]
  } | null
}

export async function getOrders(): Promise<OrderWithCustomer[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("orders")
    .select("*, customers(full_name, phone)")
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200)
  return (data ?? []) as unknown as OrderWithCustomer[]
}

export async function getOrder(id: string): Promise<OrderWithCustomer | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("orders")
    .select("*, customers(full_name, phone), bouquets(id, cost_price, sale_price, profit, margin_percent, bouquet_items(flower_id, variety_id, color_id, quantity, unit_cost))")
    .eq("id", id)
    .single()
  if (!data) return null
  const raw = data as unknown as OrderWithCustomer & {
    bouquets?: Array<{ id: string; cost_price: number | null; sale_price: number | null; profit: number | null; margin_percent: number | null; bouquet_items: BouquetItemForEdit[] }>
  }
  const firstBouquet = raw.bouquets?.[0] ?? null
  return {
    ...raw,
    bouquet: firstBouquet
      ? { ...firstBouquet, items: firstBouquet.bouquet_items ?? [] }
      : null,
  } as OrderWithCustomer
}

export async function getCustomers(): Promise<Customer[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("customers")
    .select("*")
    .order("full_name")
  return data ?? []
}

export async function findCustomerByPhone(
  phone: string
): Promise<{ id: string; full_name: string } | null> {
  if (!phone.trim()) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from("customers")
    .select("id, full_name")
    .eq("phone", phone.trim())
    .limit(1)
    .maybeSingle()
  return data
}

export type CustomerSearchResult = {
  id: string
  full_name: string
  phone: string | null
  comment: string | null
  avg_check: number | null
}

function normalizeCustomerSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
}

export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  const q = normalizeCustomerSearchQuery(query)
  if (q.length < 2) return []
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return []
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, comment, avg_check")
    .eq("organization_id", orgId)
    .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .order("full_name")
    .limit(10)
  if (error) {
    console.error("[searchCustomers]", error.message)
    return []
  }
  return data ?? []
}

/**
 * Result of createOrder.
 *
 * `partial: true` means the ORDER ROW ALREADY EXISTS but a later write failed.
 * The caller must NOT retry createOrder in that state — a retry would insert a
 * second order. `id` is always present alongside it so the caller can send the
 * user to the order that was created.
 */
export type CreateOrderResult = {
  error?: string
  id?: string
  partial?: boolean
}

export type BouquetPayload = {
  items: Array<{
    flower_id: string
    name: string
    unit: string
    quantity: number
    unit_cost: number
    variety_id?: string | null
    color_id?: string | null
  }>
  cost_price: number
  sale_price: number
  profit: number
  margin_percent: number
  // Provenance: which recipe (if any) this bouquet was originally composed
  // from. Only ever set on first insert (new order, or an edit that adds a
  // bouquet to a previously bouquet-less order) — never touched when
  // updating an existing bouquet row, so persisted provenance is never
  // overwritten by a later edit.
  recipe_id?: string | null
}

// Exactly the item shape replace_order_bouquet's input contract owns, and
// nothing else. Validated items also carry total_cost, but the RPC derives that
// itself from quantity x unit_cost in the same transaction as the write, so
// sending it would offer the database a number it is not going to trust.
// bouquet_id and product_id are likewise the RPC's to decide.
//
// Client-sent recipe_id is not re-checked here any more either: the RPC
// re-resolves it against the caller's own organization before persisting, so a
// tampered payload still can't attach another organization's recipe as
// provenance. That check moved inside the transaction it guards.
function toBouquetRpcItems(items: NormalizedBouquetItem[]) {
  return items.map((item) => ({
    flower_id: item.flower_id,
    variety_id: item.variety_id,
    color_id: item.color_id,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
  }))
}

export async function createOrder(formData: {
  customer_name: string
  customer_phone: string
  type: string
  order_date: string
  ready_at: string
  delivery_address?: string
  subtotal: number
  delivery_cost?: number
  discount?: number
  payment_method?: string
  paid_amount?: number
  customer_comment?: string
  florist_comment?: string
  bouquet?: BouquetPayload
}): Promise<CreateOrderResult> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  // Validated before any write: nothing below can be rolled back once it runs.
  const hasBouquet = Boolean(formData.bouquet && formData.bouquet.items.length > 0)
  const validatedItems = hasBouquet ? validateBouquetItems(formData.bouquet!.items) : null
  if (validatedItems && !validatedItems.ok) return { error: validatedItems.error }

  // Find or create customer
  let customerId: string | null = null
  if (formData.customer_phone.trim()) {
    // A query error here must not read as "no such customer": that would fall
    // through to the insert below and create a duplicate customer for a phone
    // number that already exists. Same control-flow defect as the bouquet
    // lookup in updateOrder.
    const { data: existing, error: lookupErr } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("phone", formData.customer_phone.trim())
      .limit(1)
      .maybeSingle()
    if (lookupErr) {
      return { error: "Не удалось проверить клиента. Попробуйте ещё раз." }
    }

    if (existing) {
      customerId = existing.id
    } else {
      const { data: newCust, error: custErr } = await supabase
        .from("customers")
        .insert({
          organization_id: orgId,
          full_name: formData.customer_name.trim() || "Клиент",
          phone: formData.customer_phone.trim(),
        })
        .select("id")
        .single()
      if (custErr) return { error: custErr.message }
      customerId = newCust?.id ?? null
    }
  } else if (formData.customer_name.trim()) {
    const { data: newCust, error: custErr } = await supabase
      .from("customers")
      .insert({
        organization_id: orgId,
        full_name: formData.customer_name.trim(),
      })
      .select("id")
      .single()
    if (custErr) return { error: custErr.message }
    customerId = newCust?.id ?? null
  }

  // order_number is assigned atomically by the orders_assign_order_number
  // DB trigger (migration_031) — not computed here.
  const subtotal = formData.subtotal ?? 0
  const deliveryCost = formData.delivery_cost ?? 0
  const discount = formData.discount ?? 0
  const paidAmount = formData.paid_amount ?? 0
  const totalAmount = subtotal + deliveryCost - discount

  const paymentStatus =
    paidAmount <= 0
      ? "unpaid"
      : paidAmount >= totalAmount
      ? "paid"
      : "partial"

  const { data: orderRow, error: oe } = await supabase
    .from("orders")
    .insert({
      organization_id: orgId,
      customer_id: customerId,
      order_date: formData.order_date,
      ready_at: formData.ready_at || null,
      type: formData.type,
      delivery_address: formData.delivery_address || null,
      status: "new",
      payment_status: paymentStatus,
      payment_method: formData.payment_method || null,
      subtotal,
      delivery_cost: deliveryCost,
      discount,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      customer_comment: formData.customer_comment || null,
      florist_comment: formData.florist_comment || null,
      stock_written_off: false,
      whatsapp_sent: false,
    })
    .select("id")
    .single()

  if (oe || !orderRow) {
    if (oe?.code === "23505") return { error: "Номер заказа занят — попробуйте ещё раз" }
    return { error: oe?.message ?? "Ошибка создания заказа" }
  }
  const orderId = orderRow.id

  // Save bouquet if provided
  if (validatedItems?.ok) {
    // The order row is already committed, so every failure below still has to
    // invalidate the list cache before reporting — otherwise the new order
    // stays invisible until the next navigation.
    // Every failure past this point leaves a real order row behind, so the
    // result carries its id and `partial: true`. The caller must recover by
    // opening that order, never by calling createOrder again.
    const failAfterOrderCreated = (message: string): CreateOrderResult => {
      revalidatePath("/orders")
      return { id: orderId, error: message, partial: true }
    }
    const b = formData.bouquet!
    // One transaction for the whole bouquet: header, items and the order's
    // cost_price either all land or none of them do. The order row itself was
    // written by a separate request above and is still deliberately NOT rolled
    // back — a compensating delete would be a fake rollback. That residue is
    // exactly what `partial: true` reports, so createOrder as a whole is not
    // atomic; only its bouquet persistence now is.
    const { error: rpcErr } = await supabase.rpc("replace_order_bouquet", {
      p_order_id: orderId,
      p_bouquet: {
        cost_price: b.cost_price,
        sale_price: b.sale_price,
        profit: b.profit,
        margin_percent: b.margin_percent,
        recipe_id: b.recipe_id ?? null,
      },
      p_items: toBouquetRpcItems(validatedItems.items),
    })
    // The RPC's own message stays behind the database boundary: it may carry
    // ids and internal detail, so the user gets the stable generic copy.
    if (rpcErr) {
      return failAfterOrderCreated("Заказ создан, но состав букета сохранить не удалось. Откройте заказ и добавьте букет ещё раз.")
    }
  }

  revalidatePath("/orders")
  return { id: orderId }
}

const ALLOWED_STATUSES = ["new", "in_progress", "ready", "delivered"] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]

const VALID_TRANSITIONS: Record<AllowedStatus, AllowedStatus | null> = {
  new: "in_progress",
  in_progress: "ready",
  ready: "delivered",
  delivered: null,
}

export async function updateOrderStatus(
  id: string,
  status: string
): Promise<{ error?: string }> {
  if (status === "cancelled") {
    return { error: "Для отмены заказа используйте кнопку «Отменить»" }
  }
  if (!(ALLOWED_STATUSES as readonly string[]).includes(status)) {
    return { error: "Недопустимый статус заказа" }
  }
  const targetStatus = status as AllowedStatus

  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, stock_written_off")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single()

  if (!order) return { error: "Заказ не найден" }
  if (order.status === "cancelled") return { error: "Нельзя изменить статус отменённого заказа" }
  if (order.status === "delivered") return { error: "Нельзя изменить статус выданного заказа" }

  const currentStatus = order.status as AllowedStatus
  const allowedNext = VALID_TRANSITIONS[currentStatus]
  if (allowedNext !== targetStatus) {
    return { error: `Недопустимый переход статуса: ${order.status} → ${targetStatus}` }
  }

  if (targetStatus === "delivered" && !order.stock_written_off) {
    return { error: "Нельзя выдать заказ: сначала спишите склад." }
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: targetStatus })
    .eq("id", id)
    .eq("organization_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/orders")
  revalidatePath(`/orders/${id}`)
  return {}
}

export async function updateOrder(
  orderId: string,
  formData: {
    customer_name: string
    customer_phone: string
    type: string
    order_date: string
    ready_at: string
    delivery_address?: string
    subtotal: number
    delivery_cost?: number
    discount?: number
    payment_method?: string
    paid_amount?: number
    customer_comment?: string
    florist_comment?: string
    bouquet?: BouquetPayload
  }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id, customer_id, status, stock_written_off")
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .single()
  if (!existingOrder) return { error: "Заказ не найден" }
  if (existingOrder.status === "cancelled") return { error: "Отменённый заказ нельзя редактировать" }
  if (existingOrder.stock_written_off) return { error: "Нельзя изменить заказ после списания склада" }

  // Validated before any write — in particular before the destructive
  // bouquet_items delete further down, which cannot be undone.
  const validatedItems = formData.bouquet ? validateBouquetItems(formData.bouquet.items) : null
  if (validatedItems && !validatedItems.ok) return { error: validatedItems.error }

  // Update or create customer
  let customerId = existingOrder.customer_id
  if (formData.customer_name.trim() || formData.customer_phone.trim()) {
    if (customerId) {
      // `.select()` proves the row was really updated: an RLS-filtered UPDATE
      // matches zero rows and returns NO error, so `error === null` alone
      // would not tell us anything happened.
      const { data: updatedCust, error: custErr } = await supabase
        .from("customers")
        .update({
          full_name: formData.customer_name.trim() || "Клиент",
          phone: formData.customer_phone.trim() || null,
        })
        .eq("id", customerId)
        .select("id")
        .maybeSingle()
      if (custErr || !updatedCust) {
        return { error: "Не удалось сохранить клиента. Попробуйте ещё раз." }
      }
    } else {
      // This branch runs only when the order had no customer at all, so a
      // failure here attaches nobody — it never detaches an existing link.
      const { data: newCust, error: custErr } = await supabase
        .from("customers")
        .insert({
          organization_id: orgId,
          full_name: formData.customer_name.trim() || "Клиент",
          phone: formData.customer_phone.trim() || null,
        })
        .select("id")
        .single()
      if (custErr || !newCust) {
        return { error: "Не удалось сохранить клиента. Попробуйте ещё раз." }
      }
      customerId = newCust.id
    }
  }

  const subtotal = formData.subtotal ?? 0
  const deliveryCost = formData.delivery_cost ?? 0
  const discount = formData.discount ?? 0
  const paidAmount = formData.paid_amount ?? 0
  const totalAmount = subtotal + deliveryCost - discount
  const paymentStatus =
    paidAmount <= 0 ? "unpaid"
    : paidAmount >= totalAmount ? "paid"
    : "partial"

  const { error: oe } = await supabase
    .from("orders")
    .update({
      customer_id: customerId,
      type: formData.type,
      order_date: formData.order_date,
      ready_at: formData.ready_at || null,
      delivery_address: formData.delivery_address || null,
      payment_status: paymentStatus,
      payment_method: formData.payment_method || null,
      subtotal,
      delivery_cost: deliveryCost,
      discount,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      customer_comment: formData.customer_comment || null,
      florist_comment: formData.florist_comment || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("organization_id", orgId)
  if (oe) return { error: oe.message }

  // Update bouquet
  if (formData.bouquet && validatedItems?.ok) {
    // The order fields above are already committed, so a failure below must
    // still invalidate the caches before reporting — the form does not refresh
    // on error, and the page would otherwise keep showing pre-save data.
    const failAfterOrderUpdated = (message: string) => {
      revalidatePath(`/orders/${orderId}`)
      revalidatePath("/orders")
      return { error: message }
    }
    const b = formData.bouquet
    // A present bouquet is always a real save, empty items included: that is
    // how an edit clears the composition, and it is why this condition stays
    // wider than createOrder's non-empty one.
    //
    // Whether the order has no bouquet, one, or several is decided inside the
    // RPC, in the same transaction as the write: it updates the single existing
    // header (never its recipe_id, so provenance is not overwritten by an
    // edit), creates one only when there are items, and fails closed on more
    // than one. Re-deciding any of that here would only be a second, racier
    // opinion — hence no bouquet lookup in this action any more.
    const { error: rpcErr } = await supabase.rpc("replace_order_bouquet", {
      p_order_id: orderId,
      p_bouquet: {
        cost_price: b.cost_price,
        sale_price: b.sale_price,
        profit: b.profit,
        margin_percent: b.margin_percent,
        recipe_id: b.recipe_id ?? null,
      },
      p_items: toBouquetRpcItems(validatedItems.items),
    })
    // Generic copy on purpose: the RPC's own message may carry ids and internal
    // detail and stays behind the database boundary.
    if (rpcErr) {
      return failAfterOrderUpdated("Не удалось обновить состав букета. Попробуйте ещё раз.")
    }
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath("/orders")
  return {}
}

// v1 semantics: BloomWise has no WhatsApp provider integration. This logs a
// handoff attempt and hands the user off to a wa.me deep link — it can never
// confirm the message was actually sent, only that the handoff to WhatsApp
// was initiated with the text pre-filled. Both DB writes are checked so a
// failure here is never reported to the caller as a successful handoff.
export async function sendWhatsAppMessage(
  orderId: string,
  phone: string,
  message: string
): Promise<{ error?: string; url?: string }> {
  if (!phone.trim()) return { error: "Нет номера телефона" }

  const supabase = await createClient()

  const { error: logError } = await supabase.from("whatsapp_messages").insert({
    order_id: orderId,
    phone: phone.trim(),
    message,
  })
  if (logError) {
    console.error("[sendWhatsAppMessage] log insert failed:", logError.message)
    return { error: "Не удалось подготовить сообщение WhatsApp. Попробуйте ещё раз." }
  }

  // The handoff-attempt row above is already persisted at this point. If the
  // flag update below fails, that row is not rolled back (no transaction/RPC
  // in this stage) — it still accurately records that a handoff was
  // attempted from this order, just without the order-level flag confirming it.
  const { error: flagError } = await supabase
    .from("orders")
    .update({ whatsapp_sent: true })
    .eq("id", orderId)
  if (flagError) {
    console.error("[sendWhatsAppMessage] order flag update failed:", flagError.message)
    return { error: "Не удалось обновить статус заказа. Попробуйте ещё раз." }
  }

  revalidatePath(`/orders/${orderId}`)

  const clean = phone.replace(/\D/g, "")
  const url = `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
  return { url }
}

export async function updateOrderPayment(
  id: string,
  // total_amount in this payload is intentionally ignored — we load it from DB
  data: { payment_method: string; paid_amount: number; total_amount: number }
): Promise<{ error?: string }> {
  const paidAmount =
    typeof data.paid_amount === "number" && !isNaN(data.paid_amount) && data.paid_amount >= 0
      ? data.paid_amount
      : 0

  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  // Load total_amount from DB — never trust client payload for financial calculations
  const { data: order } = await supabase
    .from("orders")
    .select("id, total_amount, status")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single()

  if (!order) return { error: "Заказ не найден" }
  if (order.status === "cancelled") return { error: "Нельзя редактировать оплату отменённого заказа" }

  const dbTotalAmount = order.total_amount ?? 0

  const paymentStatus =
    paidAmount <= 0
      ? "unpaid"
      : paidAmount < dbTotalAmount
      ? "partial"
      : "paid"

  const { error } = await supabase
    .from("orders")
    .update({
      payment_method: data.payment_method || null,
      paid_amount: paidAmount,
      payment_status: paymentStatus,
    })
    .eq("id", id)
    .eq("organization_id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/orders/${id}`)
  return {}
}

export async function writeOffOrderStock(
  orderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!orderId) return { ok: false, error: "orderId не может быть пустым" }

  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { ok: false, error: "Организация не найдена" }

  // Verify order exists, belongs to org, is not cancelled, not already written off
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, stock_written_off")
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .single()

  if (!order) return { ok: false, error: "Заказ не найден" }
  if (order.status === "cancelled") return { ok: false, error: "Нельзя списать склад по отменённому заказу" }
  if (order.stock_written_off) return { ok: false, error: "Склад уже списан по этому заказу" }

  // Fetch all bouquet items for this order (order may have multiple bouquets)
  const { data: bouquets, error: bouquetError } = await supabase
    .from("bouquets")
    .select("id, bouquet_items(flower_id, variety_id, color_id, quantity)")
    .eq("order_id", orderId)

  if (bouquetError) return { ok: false, error: bouquetError.message }

  const items = (bouquets ?? []).flatMap(
    (b) =>
      (b.bouquet_items ?? []) as Array<{
        flower_id: string
        variety_id?: string | null
        color_id?: string | null
        quantity: number
      }>
  )
  if (items.length === 0) return { ok: false, error: "В заказе нет цветов для списания" }

  // Build FIFO allocation plan — variety_id/color_id preserved for precise variant matching
  const planItems = items.map((i) => ({
    flower_id: i.flower_id,
    variety_id: i.variety_id ?? null,
    color_id: i.color_id ?? null,
    quantity: i.quantity,
  }))
  const plan = await buildOrderStockPlan(supabase, orgId, planItems)
  if (!plan.ok) return { ok: false, error: plan.error }

  // Execute atomic write-off via RPC
  const result = await writeOffOrderStockViaRpc(supabase, orderId, plan.allocations)
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath("/orders")
  revalidatePath(`/orders/${orderId}`)
  return { ok: true }
}

export async function cancelOrder(
  orderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!orderId) return { ok: false, error: "orderId не может быть пустым" }

  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { ok: false, error: "Организация не найдена" }

  const { data: order } = await supabase
    .from("orders")
    .select("status, stock_written_off, stock_returned, paid_amount")
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .single()

  if (!order) return { ok: false, error: "Заказ не найден" }

  if (order.status === "cancelled") {
    if (order.stock_written_off && !order.stock_returned) {
      const result = await returnOrderStockViaRpc(supabase, orderId)
      if (!result.ok) return { ok: false, error: result.error }
      revalidatePath("/orders")
      revalidatePath(`/orders/${orderId}`)
      return { ok: true }
    }
    return { ok: false, error: "Заказ уже отменён" }
  }

  if (order.stock_written_off) {
    const result = await returnOrderStockViaRpc(supabase, orderId)
    if (!result.ok) return { ok: false, error: result.error }
    revalidatePath("/orders")
    revalidatePath(`/orders/${orderId}`)
    return { ok: true }
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("organization_id", orgId)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/orders")
  revalidatePath(`/orders/${orderId}`)
  return { ok: true }
}
