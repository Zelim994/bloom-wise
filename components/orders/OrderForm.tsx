"use client"

import { useState, useTransition, useRef, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, User, Phone, MapPin, CreditCard, MessageSquare, Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createOrder, updateOrder, searchCustomers, type BouquetPayload, type OrderWithCustomer, type CustomerSearchResult } from "@/app/actions/orders"
import type { RecipeOrderPrefill } from "@/app/actions/recipes"
import { BuilderLayout } from "@/components/bouquet-builder/BuilderLayout"
import type { FlowerForBuilder, BouquetData } from "@/components/bouquet-builder/BuilderLayout"
import { useOptionalOrderDirty } from "@/components/orders/OrderDetailShell"

type NormalizedBouquetItem = {
  flower_id: string
  variety_id: string | null
  color_id: string | null
  quantity: number
  unit_cost: number
}

type OrderFormSnapshot = {
  customerPhone: string
  customerName: string
  orderType: string
  orderDate: string
  readyAt: string
  deliveryAddress: string
  subtotal: number
  deliveryCost: number
  discount: number
  paymentMethod: string
  paidAmount: number
  customerComment: string
  floristComment: string
  bouquetSalePrice: number
  bouquetItems: NormalizedBouquetItem[]
}

function normalizeBouquetItems(
  items: Array<{
    flower_id: string
    variety_id?: string | null
    color_id?: string | null
    quantity: number
    unit_cost: number
  }>
): NormalizedBouquetItem[] {
  return items
    .map((item) => ({
      flower_id: item.flower_id,
      variety_id: item.variety_id ?? null,
      color_id: item.color_id ?? null,
      quantity: Number(item.quantity) || 0,
      unit_cost: Number(item.unit_cost) || 0,
    }))
    .sort((a, b) => {
      const keyA = `${a.flower_id}:${a.variety_id}:${a.color_id}:${a.unit_cost}:${a.quantity}`
      const keyB = `${b.flower_id}:${b.variety_id}:${b.color_id}:${b.unit_cost}:${b.quantity}`
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0
    })
}

function buildFormSnapshot(input: {
  customerPhone: string
  customerName: string
  orderType: string
  orderDate: string
  readyAt: string
  deliveryAddress: string
  subtotal: string
  deliveryCost: string
  discount: string
  paymentMethod: string
  paidAmount: string
  customerComment: string
  floristComment: string
  bouquetData: BouquetData | null
  initialBouquet?: {
    sale_price: number | null
    items: Array<{ flower_id: string; variety_id?: string | null; color_id?: string | null; quantity: number; unit_cost: number }>
  } | null
}): OrderFormSnapshot {
  const bouquetSalePrice = input.bouquetData?.sale_price ?? input.initialBouquet?.sale_price ?? 0
  const bouquetItemsSource = input.bouquetData?.items ?? input.initialBouquet?.items ?? []

  return {
    customerPhone: String(input.customerPhone ?? "").trim(),
    customerName: String(input.customerName ?? "").trim(),
    orderType: input.orderType,
    orderDate: String(input.orderDate ?? "").trim(),
    readyAt: String(input.readyAt ?? "").trim(),
    deliveryAddress: String(input.deliveryAddress ?? "").trim(),
    subtotal: Number(input.subtotal) || 0,
    deliveryCost: Number(input.deliveryCost) || 0,
    discount: Number(input.discount) || 0,
    paymentMethod: input.paymentMethod,
    paidAmount: Number(input.paidAmount) || 0,
    customerComment: String(input.customerComment ?? "").trim(),
    floristComment: String(input.floristComment ?? "").trim(),
    bouquetSalePrice: Number(bouquetSalePrice) || 0,
    bouquetItems: normalizeBouquetItems(bouquetItemsSource),
  }
}

// Derives the same BouquetData shape BuilderLayout produces via onChange, from a
// recipe prefill snapshot — used so a recipe-prefilled new order's bouquetData
// state matches what's visibly rendered from the very first render, not just
// after the user first touches the builder (BuilderLayout doesn't fire onChange
// on mount).
function deriveBouquetDataFromPrefill(prefill: { sale_price: number | null; items: BouquetData["items"] }): BouquetData {
  const cost_price = prefill.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
  const sale_price = prefill.sale_price ?? 0
  const profit = sale_price - cost_price
  const margin_percent = sale_price > 0 ? (profit / sale_price) * 100 : 0
  return { items: prefill.items, cost_price, sale_price, profit, margin_percent }
}

type OrderType = "pickup" | "delivery" | "event"
type PaymentMethod = "cash" | "card" | "transfer"

const ORDER_TYPE_OPTIONS: { value: OrderType; label: string; icon: string }[] = [
  { value: "pickup", label: "Самовывоз", icon: "🏪" },
  { value: "delivery", label: "Доставка", icon: "🚚" },
  { value: "event", label: "Мероприятие", icon: "🎉" },
]

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "transfer", label: "Перевод" },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function defaultReadyAt(baseDate?: string) {
  const d = baseDate ? new Date(baseDate + "T00:00:00") : new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(12, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

export interface InitialCustomer {
  id: string
  full_name: string
  phone: string | null
  comment: string | null
}

interface Props {
  flowers: FlowerForBuilder[]
  initialData?: OrderWithCustomer
  initialOrderDate?: string
  initialCustomer?: InitialCustomer
  // Prefill for a NEW order composed from a saved recipe. Never applies when
  // initialData is set — an existing persisted order's bouquet always wins.
  recipePrefill?: RecipeOrderPrefill | null
}

export function OrderForm({ flowers, initialData, initialOrderDate, initialCustomer, recipePrefill }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const isEdit = !!initialData
  const isCancelled = initialData?.status === "cancelled"
  const isStockLocked = Boolean(initialData?.stock_written_off)
  const isReadOnly = isCancelled || isStockLocked

  // Single canonical source for the recipe-prefill bouquet, reused for
  // BuilderLayout's initialItems/initialSalePrice, the bouquetData seed, and
  // the dirty-state baseline — so all three can never diverge. Never applies
  // on the edit-order path (existing persisted bouquet always takes priority,
  // enforced below at each use site, not just here).
  const recipeInitialBouquet =
    !isEdit && recipePrefill && recipePrefill.initialItems.length > 0
      ? { sale_price: recipePrefill.initialSalePrice ?? null, items: recipePrefill.initialItems }
      : null

  const [customerPhone, setCustomerPhone] = useState(initialData?.customers?.phone ?? initialCustomer?.phone ?? "")
  const [customerName, setCustomerName] = useState(initialData?.customers?.full_name ?? initialCustomer?.full_name ?? "")
  const [customerFound, setCustomerFound] = useState<boolean | null>(initialCustomer ? true : null)
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [orderType, setOrderType] = useState<OrderType>((initialData?.type as OrderType) ?? "pickup")
  const [orderDate, setOrderDate] = useState(initialData?.order_date ?? initialOrderDate ?? today())
  const [readyAt, setReadyAt] = useState(
    initialData?.ready_at ? initialData.ready_at.slice(0, 16) : defaultReadyAt(initialOrderDate)
  )
  const [deliveryAddress, setDeliveryAddress] = useState(initialData?.delivery_address ?? "")

  const [bouquetData, setBouquetData] = useState<BouquetData | null>(() =>
    recipeInitialBouquet ? deriveBouquetDataFromPrefill(recipeInitialBouquet) : null
  )
  const [subtotal, setSubtotal] = useState(initialData?.subtotal != null ? String(initialData.subtotal) : "")
  const [deliveryCost, setDeliveryCost] = useState(initialData?.delivery_cost ? String(initialData.delivery_cost) : "")
  const [discount, setDiscount] = useState(initialData?.discount ? String(initialData.discount) : "")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>((initialData?.payment_method as PaymentMethod) ?? "cash")
  const [paidAmount, setPaidAmount] = useState(initialData?.paid_amount ? String(initialData.paid_amount) : "")

  const [customerComment, setCustomerComment] = useState(initialData?.customer_comment ?? initialCustomer?.comment ?? "")
  const [floristComment, setFloristComment] = useState(initialData?.florist_comment ?? "")

  // Dirty-state tracking — only active when rendered inside OrderDetailShell (order edit page).
  // On the order-creation page there is no shell, orderDirty is null, and this is a no-op.
  const orderDirty = useOptionalOrderDirty()
  const showStickySave = isEdit && !isReadOnly && Boolean(orderDirty?.isDirty)

  const initialSnapshotRef = useRef<OrderFormSnapshot | null>(null)
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = buildFormSnapshot({
      customerPhone: initialData?.customers?.phone ?? initialCustomer?.phone ?? "",
      customerName: initialData?.customers?.full_name ?? initialCustomer?.full_name ?? "",
      orderType: (initialData?.type as OrderType) ?? "pickup",
      orderDate: initialData?.order_date ?? initialOrderDate ?? today(),
      readyAt: initialData?.ready_at ? initialData.ready_at.slice(0, 16) : defaultReadyAt(initialOrderDate),
      deliveryAddress: initialData?.delivery_address ?? "",
      subtotal: initialData?.subtotal != null ? String(initialData.subtotal) : "",
      deliveryCost: initialData?.delivery_cost ? String(initialData.delivery_cost) : "",
      discount: initialData?.discount ? String(initialData.discount) : "",
      paymentMethod: (initialData?.payment_method as PaymentMethod) ?? "cash",
      paidAmount: initialData?.paid_amount ? String(initialData.paid_amount) : "",
      customerComment: initialData?.customer_comment ?? initialCustomer?.comment ?? "",
      floristComment: initialData?.florist_comment ?? "",
      bouquetData: null,
      initialBouquet: initialData?.bouquet ?? recipeInitialBouquet,
    })
  }

  const currentSnapshot = useMemo<OrderFormSnapshot>(
    () =>
      buildFormSnapshot({
        customerPhone,
        customerName,
        orderType,
        orderDate,
        readyAt,
        deliveryAddress,
        subtotal,
        deliveryCost,
        discount,
        paymentMethod,
        paidAmount,
        customerComment,
        floristComment,
        bouquetData,
        initialBouquet: initialData?.bouquet ?? null,
      }),
    [
      customerPhone, customerName, orderType, orderDate, readyAt, deliveryAddress,
      subtotal, deliveryCost, discount, paymentMethod, paidAmount,
      customerComment, floristComment, bouquetData, initialData,
    ]
  )

  useEffect(() => {
    if (!orderDirty) return
    const isDirty = JSON.stringify(currentSnapshot) !== JSON.stringify(initialSnapshotRef.current)
    orderDirty.setDirty(isDirty)
    if (isDirty) setSuccessMessage(null)
  }, [currentSnapshot, orderDirty])

  useEffect(() => {
    if (!orderDirty) return
    return () => orderDirty.setDirty(false)
  }, [orderDirty])

  const sub = Number(subtotal) || 0
  const del = Number(deliveryCost) || 0
  const disc = Number(discount) || 0
  const paid = Number(paidAmount) || 0
  const total = sub + del - disc
  const remaining = total - paid

  // When bouquet changes, auto-fill subtotal with sale_price
  function handleBouquetChange(data: BouquetData) {
    setBouquetData(data)
    if (data.sale_price > 0) {
      setSubtotal(String(data.sale_price))
    }
  }

  function triggerSearch(query: string) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (query.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    searchTimeout.current = setTimeout(async () => {
      const results = await searchCustomers(query)
      setSearchResults(results)
      setShowDropdown(results.length > 0)
    }, 300)
  }

  function handleSelectCustomer(customer: CustomerSearchResult) {
    setCustomerName(customer.full_name)
    setCustomerPhone(customer.phone ?? "")
    setCustomerFound(true)
    if (customer.comment) setCustomerComment(customer.comment)
    setSearchResults([])
    setShowDropdown(false)
  }

  function handleSearchBlur() {
    // Delay allows onMouseDown on dropdown item to fire before blur closes it
    setTimeout(() => setShowDropdown(false), 150)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isReadOnly) return
    setError("")
    setSuccessMessage(null)

    if (!customerName.trim() && !customerPhone.trim()) {
      setError("Укажите клиента — имя или телефон")
      return
    }

    const currentBouquet = bouquetData ?? (initialData?.bouquet ? {
      items: initialData.bouquet.items.map((item) => {
        const f = flowers.find((fl) => fl.id === item.flower_id)
        return { flower_id: item.flower_id, name: f?.name ?? "", unit: f?.unit ?? "шт", quantity: item.quantity, unit_cost: item.unit_cost ?? 0 }
      }),
      cost_price: initialData.bouquet.cost_price ?? 0,
      sale_price: initialData.bouquet.sale_price ?? 0,
      profit: initialData.bouquet.profit ?? 0,
      margin_percent: initialData.bouquet.margin_percent ?? 0,
    } : null)
    const bouquet: BouquetPayload | undefined =
      currentBouquet && currentBouquet.items.length > 0 ? currentBouquet : undefined

    const payload = {
      customer_name: customerName,
      customer_phone: customerPhone,
      type: orderType,
      order_date: orderDate,
      ready_at: readyAt,
      delivery_address: orderType === "delivery" ? deliveryAddress : undefined,
      subtotal: sub,
      delivery_cost: del || undefined,
      discount: disc || undefined,
      payment_method: paymentMethod,
      paid_amount: paid || undefined,
      customer_comment: customerComment || undefined,
      florist_comment: floristComment || undefined,
      bouquet,
    }

    startTransition(async () => {
      if (isEdit && initialData) {
        const result = await updateOrder(initialData.id, payload)
        if (result.error) { setError(result.error); return }
        initialSnapshotRef.current = currentSnapshot
        orderDirty?.setDirty(false)
        setSuccessMessage("Изменения сохранены.")
        router.refresh()
      } else {
        const result = await createOrder(payload)
        if (result.error) { setError(result.error); return }
        router.push(`/orders/${result.id}`)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к заказам
      </button>

      {isReadOnly && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {isCancelled
            ? "Заказ отменён и доступен только для просмотра."
            : "Склад уже списан. Заказ доступен только для просмотра."}
        </div>
      )}

      {showStickySave && (
        <div className="sticky top-0 z-20 flex justify-end rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-sm">
          <Button
            type="submit"
            disabled={isPending}
            className="bg-rose-500 hover:bg-rose-600 text-white h-10 px-6 disabled:opacity-50 w-full sm:w-auto"
          >
            {isPending ? "Сохраняем..." : "Сохранить изменения"}
          </Button>
        </div>
      )}

      {/* Клиент + Детали */}
      <fieldset disabled={isReadOnly} className="grid grid-cols-1 lg:grid-cols-2 gap-5 mx-0 min-w-0">
        {/* Клиент */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b border-zinc-100">
            <User className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-700">Клиент</h2>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Телефон
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                type="tel"
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value)
                  setCustomerFound(null)
                  triggerSearch(e.target.value)
                }}
                onBlur={handleSearchBlur}
                placeholder="+7 900 000-00-00"
                className="border-zinc-200 h-10 pl-9"
              />
            </div>
            {customerFound === true && <p className="text-xs text-emerald-600">Клиент выбран из базы</p>}
            {customerFound === false && <p className="text-xs text-amber-600">Новый клиент — будет создан при сохранении</p>}
          </div>
          <div className="space-y-1.5 relative">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Имя клиента *
            </Label>
            <Input
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value)
                setCustomerFound(null)
                triggerSearch(e.target.value)
              }}
              onBlur={handleSearchBlur}
              placeholder="Анна Иванова"
              className="border-zinc-200 h-10"
            />
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border border-zinc-200 bg-white shadow-lg overflow-hidden">
                {searchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => handleSelectCustomer(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 transition-colors border-b border-zinc-50 last:border-0"
                  >
                    <p className="text-sm font-medium text-zinc-800">{c.full_name}</p>
                    {c.phone && <p className="text-xs text-zinc-400">{c.phone}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Комментарий клиента
            </Label>
            <Input
              value={customerComment}
              onChange={(e) => setCustomerComment(e.target.value)}
              placeholder="Пожелания, предпочтения..."
              className="border-zinc-200 h-10"
            />
          </div>
        </div>

        {/* Детали заказа */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b border-zinc-100">
            <MessageSquare className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-700">Детали заказа</h2>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Тип заказа
            </Label>
            <div className="flex gap-2">
              {ORDER_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOrderType(opt.value)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    orderType === opt.value
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  <span className="text-lg">{opt.icon}</span>
                  <span className="text-xs">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Дата заказа
            </Label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              required
              className="border-zinc-200 h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Готов к
            </Label>
            <Input
              type="datetime-local"
              value={readyAt}
              onChange={(e) => setReadyAt(e.target.value)}
              required
              className="border-zinc-200 h-10"
            />
          </div>
          {orderType === "delivery" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Адрес доставки
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="ул. Пушкина, д. 10, кв. 25"
                  className="border-zinc-200 h-10 pl-9"
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Комментарий флориста
            </Label>
            <Input
              value={floristComment}
              onChange={(e) => setFloristComment(e.target.value)}
              placeholder="Особенности сборки, упаковки..."
              className="border-zinc-200 h-10"
            />
          </div>
        </div>
      </fieldset>

      {/* BouquetBuilder */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Scissors className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-700">Состав букета</h2>
          {flowers.length === 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              Нет товаров на складе — оформите приход
            </span>
          )}
        </div>
        <BuilderLayout
          flowers={flowers}
          onChange={handleBouquetChange}
          initialItems={
            initialData?.bouquet
              ? initialData.bouquet.items.map((item) => {
                  const itemVarietyId = item.variety_id ?? null
                  const itemColorId = item.color_id ?? null
                  // fl.id is a composite stock key (flower_id:variety_id:color_id), not the
                  // raw flower_id — match on the individual identity fields instead.
                  const f = flowers.find(
                    (fl) =>
                      fl.flower_id === item.flower_id &&
                      (fl.variety_id ?? null) === itemVarietyId &&
                      (fl.color_id ?? null) === itemColorId
                  )
                  return {
                    flower_id: item.flower_id ?? "",
                    name: f?.name ?? "",
                    unit: f?.unit ?? "шт",
                    quantity: item.quantity,
                    unit_cost: item.unit_cost ?? 0,
                    variety_id: itemVarietyId,
                    color_id: itemColorId,
                  }
                })
              : recipeInitialBouquet?.items
          }
          initialSalePrice={initialData?.bouquet?.sale_price ?? recipeInitialBouquet?.sale_price ?? undefined}
          readOnly={isReadOnly}
        />
      </div>

      {/* Финансы */}
      <fieldset disabled={isReadOnly} className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4 mx-0 min-w-0">
        <div className="flex items-center gap-2 pb-1 border-b border-zinc-100">
          <CreditCard className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-700">Финансы</h2>
          {bouquetData && bouquetData.sale_price > 0 && (
            <span className="ml-auto text-xs text-zinc-400">
              Сумма заполнена из букета
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Сумма, ₽</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={subtotal}
              onChange={(e) => setSubtotal(e.target.value)}
              placeholder="0"
              className="border-zinc-200 h-10 tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Доставка, ₽</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={deliveryCost}
              onChange={(e) => setDeliveryCost(e.target.value)}
              placeholder="0"
              disabled={orderType !== "delivery"}
              className="border-zinc-200 h-10 tabular-nums disabled:opacity-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Скидка, ₽</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0"
              className="border-zinc-200 h-10 tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Итого, ₽</Label>
            <div className="h-10 flex items-center px-3 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="text-sm font-bold text-zinc-800 tabular-nums">
                {total.toLocaleString("ru")}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Способ оплаты
            </Label>
            <div className="flex gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value)}
                  className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    paymentMethod === opt.value
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Получено, ₽</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder="0"
              className="border-zinc-200 h-10 tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Остаток, ₽</Label>
            <div className={`h-10 flex items-center px-3 rounded-lg border ${
              remaining > 0 ? "bg-amber-50 border-amber-200"
              : remaining < 0 ? "bg-red-50 border-red-200"
              : "bg-emerald-50 border-emerald-200"
            }`}>
              <span className={`text-sm font-bold tabular-nums ${
                remaining > 0 ? "text-amber-700" : remaining < 0 ? "text-red-700" : "text-emerald-700"
              }`}>
                {remaining > 0
                  ? remaining.toLocaleString("ru")
                  : remaining < 0
                  ? `−${Math.abs(remaining).toLocaleString("ru")}`
                  : "Оплачен"}
              </span>
            </div>
          </div>
        </div>
      </fieldset>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          {error}
        </p>
      )}

      {successMessage && (
        <p aria-live="polite" className="text-sm text-[var(--sage-text)] bg-[var(--sage-bg)] px-4 py-3 rounded-xl border border-[var(--sage)]">
          {successMessage}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        {!isReadOnly && (
          <Button
            type="submit"
            disabled={isPending}
            className="bg-rose-500 hover:bg-rose-600 text-white h-10 px-6 disabled:opacity-50"
          >
            {isPending ? (isEdit ? "Сохраняем..." : "Создаём заказ...") : (isEdit ? "Сохранить изменения" : "Создать заказ")}
          </Button>
        )}
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          Отмена
        </button>
      </div>
    </form>
  )
}
