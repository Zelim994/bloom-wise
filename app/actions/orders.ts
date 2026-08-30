"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Order, Customer } from "@/lib/supabase/types"
import { getOrgId } from "@/lib/services/organizationService"
import { buildOrderStockPlan, writeOffOrderStockViaRpc, returnOrderStockViaRpc } from "@/lib/services/orderStockService"

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

// Client-sent recipe_id is never trusted as-is: re-resolve it against the
// caller's own organization before persisting, so a tampered/forged payload
// can't attach another organization's recipe as provenance. RLS already
// enforces this independently; this is an explicit, auditable belt-and-braces
// check at the actual mutation boundary.
async function resolveOwnOrgRecipeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  recipeId: string | null | undefined
): Promise<string | null> {
  if (!recipeId) return null
  const { data } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", recipeId)
    .eq("organization_id", orgId)
    .maybeSingle()
  return data?.id ?? null
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
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  // Find or create customer
  let customerId: string | null = null
  if (formData.customer_phone.trim()) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("phone", formData.customer_phone.trim())
      .limit(1)
      .maybeSingle()

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
  if (formData.bouquet && formData.bouquet.items.length > 0) {
    const b = formData.bouquet
    const recipeId = await resolveOwnOrgRecipeId(supabase, orgId, b.recipe_id)
    const { data: bouquetRow } = await supabase
      .from("bouquets")
      .insert({
        order_id: orderId,
        mode: "stock_only",
        cost_price: b.cost_price,
        sale_price: b.sale_price,
        profit: b.profit,
        margin_percent: b.margin_percent,
        is_display: false,
        recipe_id: recipeId,
      })
      .select("id")
      .single()

    if (bouquetRow) {
      const bouquetRows = b.items.map((item) => {
        const flowerId = item.flower_id
        if (!flowerId) throw new Error("Не удалось определить flower_id для позиции букета")
        return {
          bouquet_id: bouquetRow.id,
          flower_id: flowerId,
          variety_id: item.variety_id ?? null,
          color_id: item.color_id ?? null,
          product_id: null,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.quantity * item.unit_cost,
        }
      })
      await supabase.from("bouquet_items").insert(bouquetRows)
    }

    // Store cost_price on the order
    await supabase
      .from("orders")
      .update({ cost_price: b.cost_price })
      .eq("id", orderId)
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

  // Update or create customer
  let customerId = existingOrder.customer_id
  if (formData.customer_name.trim() || formData.customer_phone.trim()) {
    if (customerId) {
      await supabase
        .from("customers")
        .update({
          full_name: formData.customer_name.trim() || "Клиент",
          phone: formData.customer_phone.trim() || null,
        })
        .eq("id", customerId)
    } else {
      const { data: newCust } = await supabase
        .from("customers")
        .insert({
          organization_id: orgId,
          full_name: formData.customer_name.trim() || "Клиент",
          phone: formData.customer_phone.trim() || null,
        })
        .select("id")
        .single()
      customerId = newCust?.id ?? null
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
  if (formData.bouquet) {
    const b = formData.bouquet
    const { data: existingBouquet } = await supabase
      .from("bouquets")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle()

    let bouquetId: string | null = null
    if (existingBouquet) {
      await supabase
        .from("bouquets")
        .update({
          cost_price: b.cost_price,
          sale_price: b.sale_price,
          profit: b.profit,
          margin_percent: b.margin_percent,
        })
        .eq("id", existingBouquet.id)
      await supabase.from("bouquet_items").delete().eq("bouquet_id", existingBouquet.id)
      bouquetId = existingBouquet.id
    } else if (b.items.length > 0) {
      const recipeId = await resolveOwnOrgRecipeId(supabase, orgId, b.recipe_id)
      const { data: newBouquet } = await supabase
        .from("bouquets")
        .insert({
          order_id: orderId,
          mode: "stock_only",
          cost_price: b.cost_price,
          sale_price: b.sale_price,
          profit: b.profit,
          margin_percent: b.margin_percent,
          is_display: false,
          recipe_id: recipeId,
        })
        .select("id")
        .single()
      bouquetId = newBouquet?.id ?? null
    }

    if (bouquetId && b.items.length > 0) {
      const bouquetRows = b.items.map((item) => {
        const flowerId = item.flower_id
        if (!flowerId) throw new Error("Не удалось определить flower_id для позиции букета")
        return {
          bouquet_id: bouquetId!,
          flower_id: flowerId,
          variety_id: item.variety_id ?? null,
          color_id: item.color_id ?? null,
          product_id: null,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.quantity * item.unit_cost,
        }
      })
      await supabase.from("bouquet_items").insert(bouquetRows)
    }

    await supabase
      .from("orders")
      .update({ cost_price: b.cost_price })
      .eq("id", orderId)
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath("/orders")
  return {}
}

export async function sendWhatsAppMessage(
  orderId: string,
  phone: string,
  message: string
): Promise<{ error?: string; url?: string }> {
  if (!phone.trim()) return { error: "Нет номера телефона" }

  const supabase = await createClient()

  await supabase.from("whatsapp_messages").insert({
    order_id: orderId,
    phone: phone.trim(),
    message,
  })

  await supabase
    .from("orders")
    .update({ whatsapp_sent: true })
    .eq("id", orderId)

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
