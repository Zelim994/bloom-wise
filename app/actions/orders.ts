"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Order, Customer } from "@/lib/supabase/types"
import { getOrgId } from "@/lib/services/organizationService"

export type BouquetItemForEdit = {
  flower_id: string
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
    .select("*, customers(full_name, phone), bouquets(id, cost_price, sale_price, profit, margin_percent, bouquet_items(flower_id, quantity, unit_cost))")
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
  }>
  cost_price: number
  sale_price: number
  profit: number
  margin_percent: number
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

  // Generate order number: find global max of BW-XXXXXX, increment
  const { data: existingNums } = await supabase
    .from("orders")
    .select("order_number")
    .like("order_number", "BW-%")
  const ORDER_RE = /^BW-(\d+)$/
  let maxNum = 0
  for (const row of existingNums ?? []) {
    if (!row.order_number) continue
    const match = row.order_number.match(ORDER_RE)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > maxNum) maxNum = n
    }
  }
  const orderNumber = `BW-${String(maxNum + 1).padStart(4, "0")}`

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
      order_number: orderNumber,
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
      })
      .select("id")
      .single()

    if (bouquetRow) {
      await supabase.from("bouquet_items").insert(
        b.items.map((item) => ({
          bouquet_id: bouquetRow.id,
          flower_id: item.flower_id,
          product_id: null,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.quantity * item.unit_cost,
        }))
      )
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

export async function updateOrderStatus(
  id: string,
  status: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", id)
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
    .select("id, customer_id")
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .single()
  if (!existingOrder) return { error: "Заказ не найден" }

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
        })
        .select("id")
        .single()
      bouquetId = newBouquet?.id ?? null
    }

    if (bouquetId && b.items.length > 0) {
      await supabase.from("bouquet_items").insert(
        b.items.map((item) => ({
          bouquet_id: bouquetId!,
          flower_id: item.flower_id,
          product_id: null,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.quantity * item.unit_cost,
        }))
      )
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
  data: { payment_method: string; paid_amount: number; total_amount: number }
): Promise<{ error?: string }> {
  const paymentStatus =
    data.paid_amount <= 0
      ? "unpaid"
      : data.paid_amount >= data.total_amount
      ? "paid"
      : "partial"

  const supabase = await createClient()
  const { error } = await supabase
    .from("orders")
    .update({
      payment_method: data.payment_method,
      paid_amount: data.paid_amount,
      payment_status: paymentStatus,
    })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/orders/${id}`)
  return {}
}
