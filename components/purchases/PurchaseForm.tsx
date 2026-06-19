"use client"

import { useState, useTransition, useMemo, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ArrowLeft, ChevronDown, Truck, Info, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createPurchase } from "@/app/actions/purchases"
import type { FlowerForPurchase } from "@/app/actions/purchases"
import type { Supplier } from "@/lib/supabase/types"

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  "Срезка":     { bg: "bg-rose-100",    text: "text-rose-700"    },
  "Зелень":     { bg: "bg-emerald-100", text: "text-emerald-700" },
  "Упаковка":   { bg: "bg-sky-100",     text: "text-sky-700"     },
  "Декор":      { bg: "bg-violet-100",  text: "text-violet-700"  },
  "Аксессуары": { bg: "bg-amber-100",   text: "text-amber-700"   },
  "Горшечные":  { bg: "bg-teal-100",    text: "text-teal-700"    },
}

type LineItem = {
  _id: string
  flower_id: string
  variety_id: string
  color_id: string
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
    variety_id: "",
    color_id: "",
    quantity: "",
    cost_price: "",
    sale_price: "",
    expires_at: "",
    comment: "",
  }
}

// ─── Flower picker modal ──────────────────────────────────────────────────────

interface FlowerSelectProps {
  flowers: FlowerForPurchase[]
  value: string
  onChange: (id: string) => void
}

function FlowerSelect({ flowers, value, onChange }: FlowerSelectProps) {
  const [open, setOpen]               = useState(false)
  const [query, setQuery]             = useState("")
  const [activeCategory, setActiveCategory] = useState("Все")
  const inputRef                      = useRef<HTMLInputElement>(null)

  const selected = flowers.find((f) => f.id === value) ?? null

  const categories = useMemo(
    () => Array.from(new Set(flowers.map((f) => f.category))).sort(),
    [flowers]
  )

  const textFiltered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return flowers
    return flowers.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        (f.sku ?? "").toLowerCase().includes(q)
    )
  }, [flowers, query])

  const filtered = useMemo(() => {
    if (activeCategory === "Все") return textFiltered
    return textFiltered.filter((f) => f.category === activeCategory)
  }, [textFiltered, activeCategory])

  function openModal() {
    setQuery("")
    setActiveCategory("Все")
    setOpen(true)
  }

  function handleSelect(id: string) {
    onChange(id)
    setOpen(false)
    setQuery("")
    setActiveCategory("Все")
  }

  function handleClose() {
    setOpen(false)
    setQuery("")
    setActiveCategory("Все")
  }

  // Focus search input when modal opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open])

  return (
    <>
      {/* Trigger — compact button that fits inside table cell */}
      <button
        type="button"
        onClick={openModal}
        className={`w-full text-left rounded-lg border px-2.5 py-1.5 text-sm transition-colors hover:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-0 ${
          selected
            ? "border-zinc-200 bg-white text-zinc-800"
            : "border-zinc-200 bg-white text-zinc-400"
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={selected ? "font-medium truncate" : ""}>
            {selected ? selected.name : "Выбрать цветок"}
          </span>
          {selected && (
            <span className="text-[10px] text-zinc-400 shrink-0 font-normal">изменить</span>
          )}
        </span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
            onClick={handleClose}
          />

          {/* Dialog */}
          <div className="relative z-10 bg-white rounded-xl border border-zinc-200 shadow-2xl w-full max-w-md flex flex-col max-h-[75vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
              <h3 className="text-sm font-semibold text-zinc-800">Выберите цветок</h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Название, категория или SKU..."
                  className="w-full rounded-lg border border-zinc-200 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                />
              </div>
            </div>

            {/* Category chips */}
            <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto shrink-0" style={{ scrollbarWidth: "none" }}>
              {["Все", ...categories].map((cat) => {
                const isActive = activeCategory === cat
                const count    = cat === "Все"
                  ? textFiltered.length
                  : textFiltered.filter((f) => f.category === cat).length
                const colors   = CATEGORY_COLORS[cat]
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? cat === "Все"
                          ? "bg-zinc-900 text-white"
                          : `${colors?.bg ?? "bg-zinc-100"} ${colors?.text ?? "text-zinc-700"} ring-1 ring-inset ring-current`
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    }`}
                  >
                    {cat}
                    <span className={`text-[10px] ${isActive && cat !== "Все" ? "opacity-70" : "opacity-60"}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Divider + count */}
            <div className="px-4 pb-1.5 shrink-0 border-b border-zinc-100">
              <p className="text-[11px] text-zinc-400">
                {filtered.length} из {flowers.length} позиций
              </p>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-zinc-400">
                  Ничего не найдено
                </div>
              ) : (
                <div className="divide-y divide-zinc-50">
                  {filtered.map((f) => {
                    const colors = CATEGORY_COLORS[f.category]
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleSelect(f.id)}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-3 ${
                          value === f.id ? "bg-rose-50" : "hover:bg-zinc-50"
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="shrink-0 w-8 h-8 rounded-lg overflow-hidden">
                          {f.primary_image_url ? (
                            <img
                              src={f.primary_image_url}
                              alt={f.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center text-xs font-bold ${colors?.bg ?? "bg-zinc-100"} ${colors?.text ?? "text-zinc-500"}`}>
                              {f.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium truncate ${value === f.id ? "text-rose-700" : "text-zinc-800"}`}>
                            {f.name}
                          </p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {f.category} · {f.unit}
                            {f.sku ? ` · ${f.sku}` : ""}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-zinc-100 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────

interface Props {
  flowers: FlowerForPurchase[]
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

  function setItemFlower(id: string, flowerId: string) {
    setItems((prev) =>
      prev.map((item) =>
        item._id === id ? { ...item, flower_id: flowerId, variety_id: "", color_id: "" } : item
      )
    )
  }

  function setItemVariety(id: string, varietyId: string) {
    setItems((prev) =>
      prev.map((item) =>
        item._id === id ? { ...item, variety_id: varietyId, color_id: "" } : item
      )
    )
  }

  function setItemColor(id: string, colorId: string) {
    setItems((prev) =>
      prev.map((item) => (item._id === id ? { ...item, color_id: colorId } : item))
    )
  }

  function removeItem(id: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i._id !== id) : prev))
  }

  function addItem() {
    setItems((prev) => [...prev, makeItem()])
  }

  const goodsTotal    = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.cost_price) || 0), 0)
  const deliveryTotal = Number(deliveryCost) || 0
  const grandTotal    = goodsTotal + deliveryTotal

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!supplierName.trim()) {
      setError("Укажите поставщика")
      return
    }

    const filled = items.filter(
      (i) => i.flower_id && Number(i.quantity) > 0 && Number(i.cost_price) > 0
    )
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
          const cp  = Number(i.cost_price)
          return {
            flower_id:         i.flower_id,
            variety_id:        i.variety_id || null,
            color_id:          i.color_id   || null,
            quantity:          qty,
            cost_price:        cp,
            effective_cost:    cp + deliveryPerUnit,
            delivery_per_unit: deliveryPerUnit,
            sale_price:        Number(i.sale_price) > 0 ? Number(i.sale_price) : undefined,
            extra_costs:       Math.round(deliveryPerUnit * qty * 100) / 100,
            expires_at:        i.expires_at,
            comment:           i.comment,
          }
        }),
      })

      if (result.error) {
        setError(result.error)
        return
      }

      router.push(`/purchases/${result.id}`)
      router.refresh()
    })
  }

  const filteredSuppliers = suppliers.filter((s) =>
    supplierName.trim() === ""
      ? true
      : s.name.toLowerCase().includes(supplierName.toLowerCase())
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Fields row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Поставщик */}
        <div className="relative">
          <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5 block">
            Поставщик <span className="text-rose-500">*</span>
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
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={() => { setSupplierName(s.name); setShowSupplierList(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 text-zinc-800"
                >
                  {s.name}
                </button>
              ))}
              {supplierName.trim() &&
                !filteredSuppliers.find(
                  (s) => s.name.toLowerCase() === supplierName.toLowerCase()
                ) && (
                  <button
                    type="button"
                    onMouseDown={() => setShowSupplierList(false)}
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
              {deliveryPerUnit.toLocaleString("ru", { maximumFractionDigits: 2 })} ₽/шт на {totalQty} шт
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

      {/* ── Items table ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide min-w-[200px]">Товар</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-24">Кол-во</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-32">Цена закупки, ₽</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-32">Цена продажи, ₽</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-32">Срок годности</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-36">Себест. / шт</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide w-28">Итого, ₽</th>
                <th className="px-3 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const flower        = flowerMap.get(item.flower_id)
                const qty           = Number(item.quantity) || 0
                const cp            = Number(item.cost_price) || 0
                const hasData       = item.flower_id && qty > 0 && cp > 0
                const effectiveCost = cp + (hasData ? deliveryPerUnit : 0)
                const lineTotal     = hasData ? qty * effectiveCost : 0
                const availableColors = flower
                  ? item.variety_id
                    ? flower.colors.filter(
                        (c) => c.variety_id === null || c.variety_id === item.variety_id
                      )
                    : flower.colors
                  : []

                return (
                  <tr
                    key={item._id}
                    className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/40"
                  >
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{idx + 1}</td>

                    {/* Flower picker + variety + color */}
                    <td className="px-4 py-2.5">
                      <FlowerSelect
                        flowers={flowers}
                        value={item.flower_id}
                        onChange={(id) => setItemFlower(item._id, id)}
                      />
                      {flower && (
                        <p className="text-xs text-zinc-400 mt-0.5 px-0.5">
                          {flower.category} · {flower.unit}
                        </p>
                      )}
                      {flower && flower.varieties.length > 0 && (
                        <select
                          value={item.variety_id}
                          onChange={(e) => setItemVariety(item._id, e.target.value)}
                          className="mt-1.5 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        >
                          <option value="">Вариант / размер</option>
                          {flower.varieties.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}{v.size ? ` · ${v.size}` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                      {flower && availableColors.length > 0 && (
                        <select
                          value={item.color_id}
                          onChange={(e) => setItemColor(item._id, e.target.value)}
                          className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        >
                          <option value="">Цвет</option>
                          {availableColors.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    <td className="px-4 py-2.5">
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(item._id, "quantity", e.target.value)}
                        placeholder="0"
                        className="border-zinc-200 h-8 text-right text-sm tabular-nums"
                      />
                    </td>

                    <td className="px-4 py-2.5">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.cost_price}
                        onChange={(e) => updateItem(item._id, "cost_price", e.target.value)}
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
                        onChange={(e) => updateItem(item._id, "sale_price", e.target.value)}
                        placeholder="0.00"
                        className="border-zinc-200 h-8 text-right text-sm tabular-nums"
                      />
                    </td>

                    <td className="px-4 py-2.5">
                      <Input
                        type="date"
                        value={item.expires_at}
                        onChange={(e) => updateItem(item._id, "expires_at", e.target.value)}
                        className="border-zinc-200 h-8 text-sm"
                      />
                    </td>

                    {/* Себестоимость / шт */}
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

                    {/* Итого по строке */}
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

        {/* Table footer */}
        <div className="border-t border-zinc-100 px-4 py-3 flex items-center justify-between bg-zinc-50 flex-wrap gap-3">
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1.5 text-sm text-rose-500 hover:text-rose-600 font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Добавить строку
          </button>

          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-zinc-400">
              {items.filter((i) => i.flower_id).length} позиций
            </span>
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
            <div>
              <span className="text-zinc-500">Итого: </span>
              <span className="text-base font-bold text-zinc-900 tabular-nums">
                ₽{grandTotal.toLocaleString("ru", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          {error}
        </p>
      )}

      {/* ── Bottom action bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>

        <Button
          type="submit"
          disabled={isPending}
          className="bg-rose-500 hover:bg-rose-600 text-white h-10 px-8"
        >
          {isPending ? "Сохраняем..." : "Провести поставку"}
        </Button>
      </div>
    </form>
  )
}
