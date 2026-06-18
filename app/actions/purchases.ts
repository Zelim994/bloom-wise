"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Purchase, Flower, Supplier } from "@/lib/supabase/types"
import { findOrCreateSupplier, validateAndDeleteInventoryBatch } from "@/lib/services/purchaseService"
import { getOrgId } from "@/lib/services/organizationService"

export type PurchaseWithSupplier = Purchase & { suppliers: { name: string; phone: string | null } | null }

export type PurchaseLineItem = {
  flower_id: string
  quantity: number
  cost_price: number       // закупочная цена без доставки
  effective_cost: number   // cost_price + delivery_per_unit (хранится в inventory_items)
  delivery_per_unit: number
  extra_costs: number      // delivery_per_unit * quantity (хранится в purchase_items)
  sale_price?: number      // цена продажи (обновляет flowers.sale_price)
  expires_at: string
  comment: string
}

export async function getPurchases(): Promise<PurchaseWithSupplier[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("purchases")
    .select("*, suppliers(name)")
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100)
  return (data ?? []) as unknown as PurchaseWithSupplier[]
}

export type PurchaseListRow = {
  id: string
  purchase_date: string
  total_amount: number | null
  comment: string | null
  status: string
  created_at: string
  supplier_id: string | null
  suppliers: { name: string } | null
  item_count: number
}

export async function getPurchasesList(): Promise<PurchaseListRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("purchases")
    .select("id, purchase_date, total_amount, comment, status, created_at, supplier_id, suppliers(name), purchase_items(id)")
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200)
  return ((data ?? []) as unknown as Array<PurchaseListRow & { purchase_items: Array<{ id: string }> }>).map(
    (p) => ({ ...p, item_count: p.purchase_items?.length ?? 0 })
  )
}

export type PurchaseItemWithFlower = {
  id: string
  quantity: number
  cost_price: number
  extra_costs: number
  expires_at: string | null
  comment: string | null
  flowers: { name: string; unit: string } | null
}

export async function getPurchaseItems(purchaseId: string): Promise<PurchaseItemWithFlower[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("purchase_items")
    .select("id, quantity, cost_price, extra_costs, expires_at, comment, flowers(name, unit)")
    .eq("purchase_id", purchaseId)
    .not("flower_id", "is", null)
  return (data ?? []) as unknown as PurchaseItemWithFlower[]
}

export type PurchaseDetailItem = {
  id: string
  flower_id: string | null
  inventory_item_id: string | null
  quantity: number
  cost_price: number
  extra_costs: number | null
  expires_at: string | null
  comment: string | null
  flowers: { id: string; name: string; category: string; unit: string; sale_price: number | null } | null
}

export type PurchaseDetail = PurchaseWithSupplier & {
  items: PurchaseDetailItem[]
}

export async function getPurchaseDetail(id: string): Promise<PurchaseDetail | null> {
  const supabase = await createClient()
  const [purchaseRes, itemsRes] = await Promise.all([
    supabase.from("purchases").select("*, suppliers(name, phone)").eq("id", id).single(),
    supabase
      .from("purchase_items")
      .select("id, flower_id, inventory_item_id, quantity, cost_price, extra_costs, expires_at, comment, flowers(id, name, category, unit, sale_price)")
      .eq("purchase_id", id)
      .not("flower_id", "is", null),
  ])
  if (!purchaseRes.data) return null
  return {
    ...(purchaseRes.data as unknown as PurchaseWithSupplier),
    items: (itemsRes.data ?? []) as unknown as PurchaseDetailItem[],
  }
}

export type PurchaseBatch = {
  id: string
  arrived_at: string
  cost_price: number
  quantity_in: number
  quantity_remaining: number
  freshness_status: string | null
  expires_at: string | null
  flower_id: string
  flowers: { name: string; unit: string } | null
}

export async function getPurchaseBatches(purchaseId: string): Promise<PurchaseBatch[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("inventory_items")
    .select("id, arrived_at, cost_price, quantity_in, quantity_remaining, freshness_status, expires_at, flower_id, flowers(name, unit)")
    .eq("purchase_id", purchaseId)
    .order("arrived_at", { ascending: true })
  return (data ?? []) as unknown as PurchaseBatch[]
}

export type PurchaseMovement = {
  id: string
  created_at: string | null
  movement_type: string
  quantity: number
  comment: string | null
  flower_id: string
  flowers: { name: string; unit: string } | null
}

export async function getPurchaseMovements(purchaseId: string): Promise<PurchaseMovement[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("stock_movements")
    .select("id, created_at, movement_type, quantity, comment, flower_id, flowers(name, unit)")
    .eq("source_type", "purchase")
    .eq("source_id", purchaseId)
    .order("created_at", { ascending: false })
  return (data ?? []) as unknown as PurchaseMovement[]
}

export async function getSuppliers(): Promise<Supplier[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("suppliers")
    .select("*")
    .eq("is_active", true)
    .order("name")
  return data ?? []
}

// Выбор товаров из каталога (flowers) при оформлении прихода
export async function getFlowersForPurchase(): Promise<Flower[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("flowers")
    .select("id, name, unit, category, min_stock")
    .eq("is_active", true)
    .order("category")
    .order("name")
  return (data ?? []) as unknown as Flower[]
}

export async function createPurchase(formData: {
  supplier_name: string
  purchase_date: string
  comment: string
  delivery_cost: number
  items: PurchaseLineItem[]
}): Promise<{ error?: string; id?: string }> {
  if (formData.items.length === 0) return { error: "Добавьте хотя бы один товар" }

  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  const { supplierId, error: supplierError } = await findOrCreateSupplier(supabase, orgId, formData.supplier_name)
  if (supplierError) return { error: supplierError }

  const totalAmount =
    formData.items.reduce((s, i) => s + i.quantity * i.cost_price, 0) +
    (formData.delivery_cost ?? 0)

  // Создаём запись прихода
  const { data: purchaseRow, error: pe } = await supabase
    .from("purchases")
    .insert({
      organization_id: orgId,
      supplier_id: supplierId,
      purchase_date: formData.purchase_date,
      total_amount: totalAmount,
      comment: formData.comment || null,
      status: "confirmed",
    })
    .select("id")
    .single()

  if (pe || !purchaseRow) return { error: pe?.message ?? "Ошибка создания прихода" }
  const purchaseId = purchaseRow.id

  // Для каждой строки создаём inventory_item + stock_movement + purchase_items
  for (const item of formData.items) {
    const { data: invItem, error: ie } = await supabase
      .from("inventory_items")
      .insert({
        organization_id: orgId,
        flower_id: item.flower_id,
        supplier_id: supplierId,
        arrived_at: formData.purchase_date,
        cost_price: item.effective_cost,  // цена с учётом доставки
        quantity_in: item.quantity,
        quantity_remaining: item.quantity,
        expires_at: item.expires_at || null,
        freshness_status: "fresh",
        purchase_id: purchaseId,
      })
      .select("id")
      .single()

    if (ie || !invItem) return { error: ie?.message ?? "Ошибка создания партии" }

    const { error: me } = await supabase.from("stock_movements").insert({
      organization_id: orgId,
      flower_id: item.flower_id,
      inventory_item_id: invItem.id,
      quantity: item.quantity,
      movement_type: "purchase",
      source_type: "purchase",
      source_id: purchaseId,
      comment: item.comment || null,
    })
    if (me) return { error: me.message }

    const { error: pie } = await supabase.from("purchase_items").insert({
      purchase_id: purchaseId,
      flower_id: item.flower_id,
      inventory_item_id: invItem.id,
      quantity: item.quantity,
      cost_price: item.cost_price,           // закупочная цена без доставки
      extra_costs: item.extra_costs ?? 0,    // доля доставки за всю строку
      expires_at: item.expires_at || null,
      comment: item.comment || null,
    })
    if (pie) return { error: pie.message }

    // Обновляем цену продажи в каталоге цветов, если указана
    if (item.sale_price && item.sale_price > 0) {
      await supabase
        .from("flowers")
        .update({ sale_price: item.sale_price })
        .eq("id", item.flower_id)
    }
  }

  revalidatePath("/purchases")
  revalidatePath("/inventory")
  return { id: purchaseId }
}

export type UpdatePurchaseItem = {
  item_id: string
  inventory_item_id: string | null
  flower_id: string
  quantity: number
  cost_price: number
  effective_cost: number
  extra_costs: number
  sale_price?: number
  expires_at: string
  comment: string
}

export async function deletePurchaseItem(
  purchaseId: string,
  itemId: string,
  inventoryItemId: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient()

  if (inventoryItemId) {
    const result = await validateAndDeleteInventoryBatch(supabase, inventoryItemId)
    if (!result.ok) {
      return { error: `Нельзя удалить — из этой партии уже использовано ${result.usedCount} шт.` }
    }
  }

  await supabase.from("purchase_items").delete().eq("id", itemId)

  // Пересчитываем total_amount поставки
  const { data: remaining } = await supabase
    .from("purchase_items")
    .select("quantity, cost_price, extra_costs")
    .eq("purchase_id", purchaseId)

  const newTotal = (remaining ?? []).reduce(
    (s, i) => s + i.quantity * i.cost_price + (i.extra_costs ?? 0),
    0
  )
  await supabase.from("purchases").update({ total_amount: newTotal }).eq("id", purchaseId)

  revalidatePath("/purchases")
  revalidatePath(`/purchases/${purchaseId}`)
  revalidatePath("/inventory")
  return {}
}

export async function deletePurchase(purchaseId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from("purchase_items")
    .select("id, inventory_item_id")
    .eq("purchase_id", purchaseId)

  for (const item of items ?? []) {
    if (item.inventory_item_id) {
      const result = await validateAndDeleteInventoryBatch(supabase, item.inventory_item_id)
      if (!result.ok) {
        return { error: "Нельзя удалить поставку — часть товаров уже продана или использована" }
      }
    }
    await supabase.from("purchase_items").delete().eq("id", item.id)
  }

  await supabase.from("purchases").delete().eq("id", purchaseId)

  revalidatePath("/purchases")
  revalidatePath("/inventory")
  return {}
}

export async function updatePurchase(
  purchaseId: string,
  formData: {
    supplier_name: string
    purchase_date: string
    comment: string
    delivery_cost: number
    items: UpdatePurchaseItem[]
    deleted_item_ids?: string[]
  }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "Организация не найдена" }

  const { supplierId, error: supplierError } = await findOrCreateSupplier(supabase, orgId, formData.supplier_name)
  if (supplierError) return { error: supplierError }

  const totalAmount =
    formData.items.reduce((s, i) => s + i.quantity * i.cost_price, 0) +
    (formData.delivery_cost ?? 0)

  const { error: pe } = await supabase
    .from("purchases")
    .update({
      supplier_id: supplierId,
      purchase_date: formData.purchase_date,
      total_amount: totalAmount,
      comment: formData.comment || null,
    })
    .eq("id", purchaseId)

  if (pe) return { error: pe.message }

  // Удаляем позиции, отмеченные для удаления
  for (const deletedId of formData.deleted_item_ids ?? []) {
    const { data: pi } = await supabase
      .from("purchase_items")
      .select("inventory_item_id")
      .eq("id", deletedId)
      .single()

    if (pi?.inventory_item_id) {
      const result = await validateAndDeleteInventoryBatch(supabase, pi.inventory_item_id)
      if (!result.ok) {
        return { error: `Нельзя удалить позицию — из партии уже использовано ${result.usedCount} шт.` }
      }
    }

    await supabase.from("purchase_items").delete().eq("id", deletedId)
  }

  for (const item of formData.items) {
    await supabase
      .from("purchase_items")
      .update({
        cost_price: item.cost_price,
        extra_costs: item.extra_costs,
        expires_at: item.expires_at || null,
        comment: item.comment || null,
      })
      .eq("id", item.item_id)

    if (item.inventory_item_id) {
      await supabase
        .from("inventory_items")
        .update({ cost_price: item.effective_cost })
        .eq("id", item.inventory_item_id)
    }

    if (item.sale_price && item.sale_price > 0) {
      await supabase
        .from("flowers")
        .update({ sale_price: item.sale_price })
        .eq("id", item.flower_id)
    }
  }

  revalidatePath("/purchases")
  revalidatePath(`/purchases/${purchaseId}`)
  revalidatePath("/inventory")
  return {}
}
