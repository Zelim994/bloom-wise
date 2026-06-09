"use client"

import { useState, useMemo, useCallback } from "react"
import { StockPanel } from "./StockPanel"
import { BouquetPanel } from "./BouquetPanel"
import { FinancePanel } from "./FinancePanel"
import type { FlowerForBuilder, BouquetItem, BouquetData, InitialBuilderItem } from "@/types/builder"

// Re-export for backward compatibility with components that import from this file
export type { FlowerForBuilder, BouquetItem, BouquetData, InitialBuilderItem } from "@/types/builder"

interface Props {
  flowers: FlowerForBuilder[]
  onChange?: (data: BouquetData) => void
  initialItems?: InitialBuilderItem[]
  initialSalePrice?: number
}

type Tab = "stock" | "bouquet" | "finance"

export function BuilderLayout({ flowers, onChange, initialItems, initialSalePrice }: Props) {
  const [items, setItems] = useState<BouquetItem[]>(() => {
    if (!initialItems?.length) return []
    return initialItems.map((item) => ({
      _id: Math.random().toString(36).slice(2),
      flower_id: item.flower_id,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      current_stock: flowers.find((f) => f.id === item.flower_id)?.current_stock ?? 0,
    }))
  })
  const [salePrice, setSalePrice] = useState(() =>
    initialSalePrice ? String(initialSalePrice) : ""
  )
  const [activeTab, setActiveTab] = useState<Tab>("stock")

  const costPrice = useMemo(
    () => items.reduce((s, i) => s + i.quantity * i.unit_cost, 0),
    [items]
  )
  const salePriceNum = Number(salePrice) || 0
  const profit = salePriceNum - costPrice
  const margin = salePriceNum > 0 ? (profit / salePriceNum) * 100 : 0

  const notify = useCallback(
    (nextItems: BouquetItem[], nextSalePrice: string) => {
      if (!onChange) return
      const sp = Number(nextSalePrice) || 0
      const cp = nextItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
      const pr = sp - cp
      const mg = sp > 0 ? (pr / sp) * 100 : 0
      onChange({
        items: nextItems.map(({ flower_id, name, unit, quantity, unit_cost }) => ({
          flower_id,
          name,
          unit,
          quantity,
          unit_cost,
        })),
        cost_price: cp,
        sale_price: sp,
        profit: pr,
        margin_percent: mg,
      })
    },
    [onChange]
  )

  function handleAdd(flower: FlowerForBuilder) {
    setItems((prev) => {
      const existing = prev.find((i) => i.flower_id === flower.id)
      const next = existing
        ? prev.map((i) =>
            i.flower_id === flower.id ? { ...i, quantity: i.quantity + 1 } : i
          )
        : [
            ...prev,
            {
              _id: Math.random().toString(36).slice(2),
              flower_id: flower.id,
              name: flower.name,
              unit: flower.unit,
              quantity: 1,
              unit_cost: flower.unit_cost,
              current_stock: flower.current_stock,
            },
          ]
      notify(next, salePrice)
      return next
    })
  }

  function handleQuantityChange(id: string, qty: number) {
    if (qty <= 0) {
      handleRemove(id)
      return
    }
    setItems((prev) => {
      const next = prev.map((i) => (i._id === id ? { ...i, quantity: qty } : i))
      notify(next, salePrice)
      return next
    })
  }

  function handleRemove(id: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i._id !== id)
      notify(next, salePrice)
      return next
    })
  }

  function handleSalePriceChange(v: string) {
    setSalePrice(v)
    notify(items, v)
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "stock", label: "Склад", badge: flowers.length },
    { key: "bouquet", label: "Букет", badge: items.length > 0 ? items.length : undefined },
    { key: "finance", label: "Финансы" },
  ]

  return (
    <div className="flex flex-col h-[440px] rounded-xl border border-zinc-200 overflow-hidden">
      {/* Mobile tabs */}
      <div className="flex border-b border-zinc-200 lg:hidden shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === t.key
                ? "text-rose-600 border-b-2 border-rose-500"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
            {t.badge != null && (
              <span className="ml-1.5 text-xs bg-zinc-100 text-zinc-600 rounded-full px-1.5 py-0.5">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Stock */}
        <div
          className={`flex-none border-r border-zinc-200 overflow-hidden lg:block lg:w-[32%] ${
            activeTab === "stock" ? "block w-full" : "hidden"
          }`}
        >
          <StockPanel flowers={flowers} items={items} onAdd={handleAdd} />
        </div>

        {/* Bouquet */}
        <div
          className={`flex-1 overflow-hidden border-r border-zinc-200 lg:block ${
            activeTab === "bouquet" ? "block w-full" : "hidden"
          }`}
        >
          <BouquetPanel
            items={items}
            onQuantityChange={handleQuantityChange}
            onRemove={handleRemove}
          />
        </div>

        {/* Finance */}
        <div
          className={`flex-none overflow-hidden lg:block lg:w-[27%] ${
            activeTab === "finance" ? "block w-full" : "hidden"
          }`}
        >
          <FinancePanel
            costPrice={costPrice}
            salePrice={salePrice}
            profit={profit}
            margin={margin}
            itemCount={items.length}
            onChange={handleSalePriceChange}
          />
        </div>
      </div>
    </div>
  )
}
