"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ArrowLeft, ChevronDown, Truck, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createPurchase } from "@/app/actions/purchases"
import type { Flower, Supplier } from "@/lib/supabase/types"

type LineItem = {
  _id: string
  flower_id: string
  quantity: string
  cost_price: string
  sale_price: string
  expires_at: string
  comment: string
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function makeItem(): LineItem {
  return {
    _id: Math.random().toString(36).slice(2),
    flower_id: "",
    quantity: "",
    cost_price: "",
    sale_price: "",
    expires_at: "",
    comment: "",
  }
}

interface Props {
  flowers: Flower[]
  suppliers: Supplier[]
}

export function PurchaseForm({ flowers, suppliers }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [showSupplierList, setShowSupplierList] = useState(false)
  const [purchaseDate, setPurchaseDate] = useState(today())
  const [comment, setComment] = useState("")
  const [deliveryCost, setDeliveryCost] = useState("")
  const [items, setItems] = useState<LineItem[]>([makeItem()])

  const flowerMap = new Map(flowers.map((f) => [f.id, f]))

  // Delivery distribution per unit (equal per stem across all filled lines)
  const { totalQty, deliveryPerUnit } = useMemo(() => {
    const totalQty = items.reduce((s, i) => {
      const qty = Number(i.quantity) || 0
      return i.flower_id ? s + qty : s
    }, 0)
    const dc = Number(deliveryCost) || 0
    return { totalQty, deliveryPerUnit: totalQty > 0 ? dc / totalQty : 0 }
  }, [items, deliveryCost])

  function updateItem(id: string, field: keyof LineItem, value: string) {
    setItems((prev) =>
      prev.map((item) => (item._id === id ? { ...item, [field]: value } : item))
    )
  }

  function removeItem(id: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i._id !== id) : prev))
  }

  function addItem() {
    setItems((prev) => [...prev, makeItem()])
  }

  const goodsTotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const price = Number(item.cost_price) || 0
    return sum + qty * price
  }, 0)
  const deliveryTotal = Number(deliveryCost) || 0
  const grandTotal = goodsTotal + deliveryTotal

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    const filled = items.filter((i) => i.flower_id && Number(i.quantity) > 0 && Number(i.cost_price) > 0)
    if (filled.length === 0) {
      setError("Добавьте хотя бы один товар с количеством и закупочной ценой")
      return
    }

    startTransition(async () => {
      const result = await createPurchase({
        supplier_name: supplierName,
        purchase_date: purchaseDate,
        comment,
        delivery_cost: deliveryTotal,
        items: filled.map((i) => {
          const qty = Number(i.quantity)
          const cp = Number(i.cost_price)
          return {
            flower_id: i.flower_id,
            quantity: qty,
            cost_price: cp,
            effective_cost: cp + deliveryPerUnit,
            delivery_per_unit: deliveryPerUnit,
            sale_price: Number(i.sale_price) > 0 ? Number(i.sale_price) : undefined,
            extra_costs: Math.round(deliveryPerUnit * qty * 100) / 100,
            expires_at: i.expires_at,
            comment: i.comment,
          }
        }),
      })

      if (result.error) {
        setError(result.error)
        return
      }
      router.push("/purchases")
      router.refresh()
    })
  }

  const filteredSuppliers = suppliers.filter((s) =>
    supplierName.trim() === "" ? true : s.name.toLowerCase().includes(supplierName.toLowerCase())
  )

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
            <Input type="date" value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required className="border-zinc-200 h-10"
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
            <Input value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Накладная №..." className="border-zinc-200 h-10"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="mt-5 shrink-0 bg-rose-500 hover:bg-rose-600 text-white h-10 px-6"
        >
          {isPending ? "Сохраняем..." : "Провести поставку"}
        </Button>
      </div>

      {/* Таблица товаров */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide min-w-[200px]">Товар</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-24">Кол-во</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-32">
                  Цена закупки, ₽
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-32">
                  Цена продажи, ₽
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-32">
                  Срок годности
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-36">
                  Себест. / шт
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-28">
                  Итого, ₽
                </th>
                <th className="px-3 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const flower = flowerMap.get(item.flower_id)
                const qty = Number(item.quantity) || 0
                const cp = Number(item.cost_price) || 0
                const hasData = item.flower_id && qty > 0 && cp > 0
                const effectiveCost = cp + (hasData ? deliveryPerUnit : 0)
                const lineTotal = hasData ? qty * effectiveCost : 0

                return (
                  <tr key={item._id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/40">
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{idx + 1}</td>

                    <td className="px-4 py-2.5">
                      <select
                        value={item.flower_id}
                        onChange={(e) => updateItem(item._id, "flower_id", e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                      >
                        <option value="">— Выберите товар —</option>
                        {flowers.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                      {flower && (
                        <p className="text-xs text-zinc-400 mt-0.5 px-0.5">
                          {flower.category} · {flower.unit}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-2.5">
                      <Input
                        type="number" min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(item._id, "quantity", e.target.value)}
                        placeholder="0"
                        className="border-zinc-200 h-8 text-right text-sm tabular-nums"
                      />
                    </td>

                    {/* Цена закупки */}
                    <td className="px-4 py-2.5">
                      <Input
                        type="number" min={0} step={0.01}
                        value={item.cost_price}
                        onChange={(e) => updateItem(item._id, "cost_price", e.target.value)}
                        placeholder="0.00"
                        className="border-zinc-200 h-8 text-right text-sm tabular-nums"
                      />
                    </td>

                    {/* Цена продажи */}
                    <td className="px-4 py-2.5">
                      <Input
                        type="number" min={0} step={0.01}
                        value={item.sale_price}
                        onChange={(e) => updateItem(item._id, "sale_price", e.target.value)}
                        placeholder="0.00"
                        className="border-zinc-200 h-8 text-right text-sm tabular-nums"
                      />
                    </td>

                    {/* Срок годности */}
                    <td className="px-4 py-2.5">
                      <Input
                        type="date" value={item.expires_at}
                        onChange={(e) => updateItem(item._id, "expires_at", e.target.value)}
                        className="border-zinc-200 h-8 text-sm"
                      />
                    </td>

                    {/* Себестоимость / шт — с разбивкой доставки */}
                    <td className="px-4 py-2.5 text-right">
                      {!hasData ? (
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

                    {/* Итого */}
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
                        onClick={() => removeItem(item._id)}
                        disabled={items.length === 1}
                        className="text-zinc-300 hover:text-red-500 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer таблицы */}
        <div className="border-t border-zinc-100 px-4 py-3 flex items-center justify-between bg-zinc-50">
          <button
            type="button" onClick={addItem}
            className="flex items-center gap-1.5 text-sm text-rose-500 hover:text-rose-600 font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Добавить строку
          </button>

          <div className="flex items-center gap-5 text-sm">
            <span className="text-zinc-400">
              {items.filter((i) => i.flower_id).length} позиций
            </span>
            {deliveryTotal > 0 && (
              <>
                <div className="text-right">
                  <span className="text-zinc-400">Товары: </span>
                  <span className="font-medium text-zinc-700 tabular-nums">
                    ₽{goodsTotal.toLocaleString("ru", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="text-right">
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
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          {error}
        </p>
      )}
    </form>
  )
}
