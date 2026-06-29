"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Truck, Info, ChevronDown, Trash2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updatePurchase, deletePurchase } from "@/app/actions/purchases"
import type { PurchaseDetail } from "@/app/actions/purchases"
import type { Supplier } from "@/lib/supabase/types"

type EditItem = {
  item_id: string
  inventory_item_id: string | null
  flower_id: string
  flower_name: string
  flower_unit: string
  quantity: number
  cost_price: string
  sale_price: string
  expires_at: string
  comment: string
}

interface Props {
  purchase: PurchaseDetail
  suppliers: Supplier[]
}

export function EditPurchaseForm({ purchase, suppliers }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [error, setError] = useState("")
  const [supplierName, setSupplierName] = useState(purchase.suppliers?.name ?? "")
  const [showSupplierList, setShowSupplierList] = useState(false)
  const [purchaseDate, setPurchaseDate] = useState(purchase.purchase_date)
  const [comment, setComment] = useState(purchase.comment ?? "")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const initialDeliveryCost = purchase.items.reduce((s, i) => s + (i.extra_costs ?? 0), 0)
  const [deliveryCost, setDeliveryCost] = useState(
    initialDeliveryCost > 0 ? String(Math.round(initialDeliveryCost * 100) / 100) : ""
  )

  const [items, setItems] = useState<EditItem[]>(
    purchase.items.map((i) => ({
      item_id: i.id,
      inventory_item_id: i.inventory_item_id,
      flower_id: i.flower_id ?? "",
      flower_name: i.flowers?.name ?? "—",
      flower_unit: i.flowers?.unit ?? "шт",
      quantity: i.quantity,
      cost_price: String(i.cost_price ?? ""),
      sale_price: i.flowers?.sale_price != null ? String(i.flowers.sale_price) : "",
      expires_at: i.expires_at ?? "",
      comment: i.comment ?? "",
    }))
  )
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([])

  const { totalQty, deliveryPerUnit } = useMemo(() => {
    const totalQty = items.reduce((s, i) => s + i.quantity, 0)
    const dc = Number(deliveryCost) || 0
    return { totalQty, deliveryPerUnit: totalQty > 0 ? dc / totalQty : 0 }
  }, [items, deliveryCost])

  const deliveryTotal = Number(deliveryCost) || 0
  const goodsTotal = items.reduce((s, i) => s + i.quantity * (Number(i.cost_price) || 0), 0)
  const grandTotal = goodsTotal + deliveryTotal

  const filteredSuppliers = suppliers.filter((s) =>
    supplierName.trim() === "" ? true : s.name.toLowerCase().includes(supplierName.toLowerCase())
  )

  function updateItem(item_id: string, field: keyof EditItem, value: string) {
    setItems((prev) =>
      prev.map((item) => (item.item_id === item_id ? { ...item, [field]: value } : item))
    )
  }

  function handleDeleteItem(item_id: string) {
    const confirmed = confirm(
      "Удалить позицию закупки?\n\nЕсли эта партия уже использовалась в списаниях, заказах или движениях склада, удаление будет заблокировано.\n\nДля неиспользованной партии будет выполнена компенсация склада."
    )
    if (!confirmed) return
    setDeletedItemIds((prev) => [...prev, item_id])
    setItems((prev) => prev.filter((i) => i.item_id !== item_id))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    startTransition(async () => {
      const result = await updatePurchase(purchase.id, {
        supplier_name: supplierName,
        purchase_date: purchaseDate,
        comment,
        delivery_cost: deliveryTotal,
        deleted_item_ids: deletedItemIds,
        items: items.map((i) => {
          const cp = Number(i.cost_price) || 0
          return {
            item_id: i.item_id,
            inventory_item_id: i.inventory_item_id,
            flower_id: i.flower_id,
            cost_price: cp,
            effective_cost: cp + deliveryPerUnit,
            extra_costs: Math.round(deliveryPerUnit * i.quantity * 100) / 100,
            sale_price: Number(i.sale_price) > 0 ? Number(i.sale_price) : undefined,
            expires_at: i.expires_at,
            comment: i.comment,
          }
        }),
      })

      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/purchases/${purchase.id}`)
      router.refresh()
    })
  }

  function handleDeletePurchase() {
    setError("")
    startDeleteTransition(async () => {
      const result = await deletePurchase(purchase.id)
      if (result.error) {
        setError(result.error)
        setShowDeleteConfirm(false)
        return
      }
      router.push("/purchases")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Шапка */}
      <div className="flex items-start gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors mt-5 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Поставщик */}
          <div className="relative">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
              Поставщик
            </Label>
            <div className="relative">
              <Input
                value={supplierName}
                onChange={(e) => { setSupplierName(e.target.value); setShowSupplierList(true) }}
                onFocus={() => setShowSupplierList(true)}
                onBlur={() => setTimeout(() => setShowSupplierList(false), 150)}
                placeholder="Введите поставщика..."
                className="border-zinc-200 h-10 pr-8"
              />
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
            </div>
            {showSupplierList && filteredSuppliers.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border border-zinc-200 bg-white shadow-lg overflow-hidden">
                {filteredSuppliers.slice(0, 8).map((s) => (
                  <button key={s.id} type="button"
                    onMouseDown={() => { setSupplierName(s.name); setShowSupplierList(false) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 text-zinc-800"
                  >
                    {s.name}
                  </button>
                ))}
                {supplierName.trim() && !filteredSuppliers.find((s) => s.name.toLowerCase() === supplierName.toLowerCase()) && (
                  <button type="button" onMouseDown={() => setShowSupplierList(false)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-rose-50 text-rose-600 border-t border-zinc-100"
                  >
                    + Создать «{supplierName.trim()}»
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Дата */}
          <div>
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
              Дата поставки
            </Label>
            <Input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
              className="border-zinc-200 h-10"
            />
          </div>

          {/* Стоимость доставки */}
          <div>
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
              <span className="flex items-center gap-1.5">
                <Truck className="h-3 w-3" />
                Стоимость доставки, ₽
              </span>
            </Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={deliveryCost}
              onChange={(e) => setDeliveryCost(e.target.value)}
              placeholder="0"
              className="border-zinc-200 h-10 tabular-nums"
            />
            {deliveryTotal > 0 && totalQty > 0 && (
              <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                <Info className="h-3 w-3 shrink-0" />
                {deliveryPerUnit.toLocaleString("ru", { maximumFractionDigits: 2 })} ₽/шт
                на {totalQty} шт
              </p>
            )}
          </div>

          {/* Комментарий */}
          <div>
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
              Комментарий
            </Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Накладная №..."
              className="border-zinc-200 h-10"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={isPending || isDeleting}
          className="mt-5 shrink-0 bg-rose-500 hover:bg-rose-600 text-white h-10 px-6"
        >
          {isPending ? "Сохраняем..." : "Сохранить"}
        </Button>
      </div>

      {/* Таблица товаров */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {items.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-zinc-400">
            Все позиции удалены. Сохраните, чтобы применить изменения.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide min-w-[180px]">Товар</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-20">Кол-во</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-32">Цена закупки, ₽</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-32">Цена продажи, ₽</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-32">Срок годности</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-36">Себест. / шт</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-28">Итого, ₽</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const cp = Number(item.cost_price) || 0
                  const effectiveCost = cp + deliveryPerUnit
                  const lineTotal = item.quantity * effectiveCost

                  return (
                    <tr key={item.item_id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/40">
                      <td className="px-4 py-2.5 text-zinc-400 text-xs">{idx + 1}</td>

                      <td className="px-4 py-2.5">
                        <p className="font-medium text-zinc-800">{item.flower_name}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{item.flower_unit}</p>
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        <span className="font-semibold text-zinc-700 tabular-nums">
                          {item.quantity}
                          <span className="text-xs font-normal text-zinc-400 ml-1">{item.flower_unit}</span>
                        </span>
                      </td>

                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.cost_price}
                          onChange={(e) => updateItem(item.item_id, "cost_price", e.target.value)}
                          placeholder="0.00"
                          className="border-zinc-200 h-8 text-right text-sm tabular-nums"
                        />
                      </td>

                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.sale_price}
                          onChange={(e) => updateItem(item.item_id, "sale_price", e.target.value)}
                          placeholder="0.00"
                          className="border-zinc-200 h-8 text-right text-sm tabular-nums"
                        />
                      </td>

                      <td className="px-4 py-2.5">
                        <Input
                          type="date"
                          value={item.expires_at}
                          onChange={(e) => updateItem(item.item_id, "expires_at", e.target.value)}
                          className="border-zinc-200 h-8 text-sm"
                        />
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        {cp === 0 ? (
                          <span className="text-zinc-300">—</span>
                        ) : deliveryPerUnit > 0 ? (
                          <div>
                            <div className="text-xs text-zinc-400 tabular-nums">
                              ₽{cp.toLocaleString("ru", { maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-xs text-blue-500 tabular-nums">
                              +₽{deliveryPerUnit.toLocaleString("ru", { maximumFractionDigits: 2 })} дост.
                            </div>
                            <div className="text-sm font-semibold text-zinc-800 tabular-nums border-t border-zinc-100 mt-0.5 pt-0.5">
                              ₽{effectiveCost.toLocaleString("ru", { maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm font-medium text-zinc-700 tabular-nums">
                            ₽{cp.toLocaleString("ru", { maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        <span className="text-sm font-medium text-zinc-700 tabular-nums">
                          {lineTotal > 0
                            ? `₽${lineTotal.toLocaleString("ru", { maximumFractionDigits: 0 })}`
                            : "—"}
                        </span>
                      </td>

                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.item_id)}
                          title="Удалить позицию"
                          className="flex items-center justify-center h-7 w-7 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-zinc-100 px-4 py-3 flex items-center justify-end gap-5 text-sm bg-zinc-50">
          <span className="text-zinc-400">{items.length} позиций</span>
          {deliveryTotal > 0 && (
            <>
              <div>
                <span className="text-zinc-400">Товары: </span>
                <span className="font-medium text-zinc-700 tabular-nums">
                  ₽{goodsTotal.toLocaleString("ru", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Доставка: </span>
                <span className="font-medium text-blue-600 tabular-nums">
                  ₽{deliveryTotal.toLocaleString("ru", { maximumFractionDigits: 0 })}
                </span>
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Итого:</span>
            <span className="text-base font-bold text-zinc-900 tabular-nums">
              ₽{grandTotal.toLocaleString("ru", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          {error}
        </p>
      )}

      {/* Удаление всей поставки */}
      <div className="border-t border-zinc-100 pt-4">
        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Удалить поставку
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 flex-1">
              Удалить всю поставку? Это откатит все партии и движения склада.
            </p>
            <button
              type="button"
              onClick={handleDeletePurchase}
              disabled={isDeleting}
              className="shrink-0 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              {isDeleting ? "Удаляем..." : "Да, удалить"}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="shrink-0 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </form>
  )
}
