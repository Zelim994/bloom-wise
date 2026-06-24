"use client"

import { useState, useMemo, useCallback } from "react"
import { StockPanel } from "./StockPanel"
import { BouquetPanel } from "./BouquetPanel"
import { FinancePanel } from "./FinancePanel"
import { AIVisualizationPanel } from "./AIVisualizationPanel"
import { AISelectionPanel } from "./AISelectionPanel"
import type { FlowerForBuilder, BouquetItem, BouquetData, InitialBuilderItem, AISuggestion } from "@/types/builder"

// Re-export for backward compatibility with components that import from this file
export type { FlowerForBuilder, BouquetItem, BouquetData, InitialBuilderItem } from "@/types/builder"

interface Props {
  flowers: FlowerForBuilder[]
  onChange?: (data: BouquetData) => void
  initialItems?: InitialBuilderItem[]
  initialSalePrice?: number
  showAIPanel?: boolean
}

type Tab = "stock" | "bouquet" | "finance"

// Find a stock position in the flowers list by flower_id + variety_id + color_id
function findFlower(
  flowers: FlowerForBuilder[],
  flowerId: string,
  varietyId?: string | null,
  colorId?: string | null
): FlowerForBuilder | undefined {
  return flowers.find(
    (f) =>
      f.flower_id === flowerId &&
      (f.variety_id ?? null) === (varietyId ?? null) &&
      (f.color_id ?? null) === (colorId ?? null)
  )
}

export function BuilderLayout({ flowers, onChange, initialItems, initialSalePrice, showAIPanel = false }: Props) {
  const [items, setItems] = useState<BouquetItem[]>(() => {
    if (!initialItems?.length) return []
    return initialItems.map((item) => {
      const matched = findFlower(flowers, item.flower_id, item.variety_id, item.color_id)
      return {
        _id: Math.random().toString(36).slice(2),
        flower_id: item.flower_id,
        variety_id: item.variety_id ?? null,
        color_id: item.color_id ?? null,
        variety_name: matched?.variety_name ?? null,
        variety_size: matched?.variety_size ?? null,
        color_name: matched?.color_name ?? null,
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        sale_price: matched?.sale_price ?? null,
        current_stock: matched?.current_stock ?? 0,
      }
    })
  })
  const [salePrice, setSalePrice] = useState(() =>
    initialSalePrice ? String(initialSalePrice) : ""
  )
  // true when user has explicitly typed a price — prevents auto-suggest from overwriting
  const [userEditedPrice, setUserEditedPrice] = useState(() => !!initialSalePrice)
  const [activeTab, setActiveTab] = useState<Tab>("stock")

  const costPrice = useMemo(
    () => items.reduce((s, i) => s + i.quantity * i.unit_cost, 0),
    [items]
  )

  // Suggested sale price: sum of item.sale_price × quantity
  const suggestedSalePrice = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * (item.sale_price ?? 0), 0),
    [items]
  )

  const hasMissingPrices = useMemo(
    () => items.length > 0 && items.some((item) => !(item.sale_price ?? 0)),
    [items]
  )

  const salePriceNum = Number(salePrice) || 0
  const profit = salePriceNum - costPrice
  const margin = salePriceNum > 0 ? (profit / salePriceNum) * 100 : 0

  // Compute suggested price string from a given items array (used inside handlers)
  function computeSuggested(nextItems: BouquetItem[]): string {
    const total = nextItems.reduce((sum, item) => sum + item.quantity * (item.sale_price ?? 0), 0)
    return total > 0 ? String(total) : ""
  }

  const notify = useCallback(
    (nextItems: BouquetItem[], nextSalePrice: string) => {
      if (!onChange) return
      const sp = Number(nextSalePrice) || 0
      const cp = nextItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
      const pr = sp - cp
      const mg = sp > 0 ? (pr / sp) * 100 : 0
      onChange({
        items: nextItems.map(({ flower_id, name, unit, quantity, unit_cost, variety_id, color_id }) => ({
          flower_id,
          name,
          unit,
          quantity,
          unit_cost,
          variety_id: variety_id ?? null,
          color_id: color_id ?? null,
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
      // Match by flower_id + variety_id + color_id to keep Mondial·80 and Mondial·100 separate
      const existing = prev.find(
        (i) =>
          i.flower_id === flower.flower_id &&
          (i.variety_id ?? null) === (flower.variety_id ?? null) &&
          (i.color_id ?? null) === (flower.color_id ?? null)
      )
      const next = existing
        ? prev.map((i) =>
            i._id === existing._id ? { ...i, quantity: i.quantity + 1 } : i
          )
        : [
            ...prev,
            {
              _id: Math.random().toString(36).slice(2),
              flower_id: flower.flower_id,
              variety_id: flower.variety_id,
              color_id: flower.color_id,
              variety_name: flower.variety_name,
              variety_size: flower.variety_size,
              color_name: flower.color_name,
              name: flower.name,
              unit: flower.unit,
              quantity: 1,
              unit_cost: flower.unit_cost,
              sale_price: flower.sale_price,
              current_stock: flower.current_stock,
            },
          ]
      if (!userEditedPrice) {
        const sp = computeSuggested(next)
        setSalePrice(sp)
        notify(next, sp)
      } else {
        notify(next, salePrice)
      }
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
      if (!userEditedPrice) {
        const sp = computeSuggested(next)
        setSalePrice(sp)
        notify(next, sp)
      } else {
        notify(next, salePrice)
      }
      return next
    })
  }

  function handleRemove(id: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i._id !== id)
      if (!userEditedPrice) {
        const sp = computeSuggested(next)
        setSalePrice(sp)
        notify(next, sp)
      } else {
        notify(next, salePrice)
      }
      return next
    })
  }

  function handleSalePriceChange(v: string) {
    if (v === "") {
      // User cleared the field — re-enable auto-suggest
      setUserEditedPrice(false)
      const sp = computeSuggested(items)
      setSalePrice(sp)
      notify(items, sp)
    } else {
      setUserEditedPrice(true)
      setSalePrice(v)
      notify(items, v)
    }
  }

  function handleApplyAISuggestions(suggestions: AISuggestion[]) {
    setItems((prev) => {
      const next = [...prev]
      for (const { flower, quantity } of suggestions) {
        const existingIdx = next.findIndex(
          (i) =>
            i.flower_id === flower.flower_id &&
            (i.variety_id ?? null) === (flower.variety_id ?? null) &&
            (i.color_id ?? null) === (flower.color_id ?? null)
        )
        if (existingIdx !== -1) {
          const existing = next[existingIdx]
          next[existingIdx] = {
            ...existing,
            quantity: Math.min(existing.quantity + quantity, flower.current_stock),
          }
        } else {
          next.push({
            _id: Math.random().toString(36).slice(2),
            flower_id: flower.flower_id,
            variety_id: flower.variety_id,
            color_id: flower.color_id,
            variety_name: flower.variety_name,
            variety_size: flower.variety_size,
            color_name: flower.color_name,
            name: flower.name,
            unit: flower.unit,
            quantity: Math.min(quantity, flower.current_stock),
            unit_cost: flower.unit_cost,
            sale_price: flower.sale_price,
            current_stock: flower.current_stock,
          })
        }
      }
      if (!userEditedPrice) {
        const sp = computeSuggested(next)
        setSalePrice(sp)
        notify(next, sp)
      } else {
        notify(next, salePrice)
      }
      return next
    })
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "stock", label: "Склад", badge: flowers.length },
    { key: "bouquet", label: "Букет", badge: items.length > 0 ? items.length : undefined },
    { key: "finance", label: "Финансы" },
  ]

  return (
    <>
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
            suggestedSalePrice={suggestedSalePrice}
            hasMissingPrices={hasMissingPrices}
            onChange={handleSalePriceChange}
          />
        </div>
      </div>
    </div>
    {showAIPanel && (
      <AISelectionPanel flowers={flowers} onApply={handleApplyAISuggestions} />
    )}
    {showAIPanel && <AIVisualizationPanel items={items} />}
    </>
  )
}
