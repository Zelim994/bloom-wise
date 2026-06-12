"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, User, Phone, MapPin, CreditCard, MessageSquare, Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createOrder, updateOrder, searchCustomers, type BouquetPayload, type OrderWithCustomer, type CustomerSearchResult } from "@/app/actions/orders"
import { BuilderLayout } from "@/components/bouquet-builder/BuilderLayout"
import type { FlowerForBuilder, BouquetData } from "@/components/bouquet-builder/BuilderLayout"

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

function defaultReadyAt() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(12, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

interface Props {
  flowers: FlowerForBuilder[]
  initialData?: OrderWithCustomer
}

export function OrderForm({ flowers, initialData }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const isEdit = !!initialData

  const [customerPhone, setCustomerPhone] = useState(initialData?.customers?.phone ?? "")
  const [customerName, setCustomerName] = useState(initialData?.customers?.full_name ?? "")
  const [customerFound, setCustomerFound] = useState<boolean | null>(null)
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [orderType, setOrderType] = useState<OrderType>((initialData?.type as OrderType) ?? "pickup")
  const [orderDate] = useState(initialData?.order_date ?? today())
  const [readyAt, setReadyAt] = useState(
    initialData?.ready_at ? initialData.ready_at.slice(0, 16) : defaultReadyAt()
  )
  const [deliveryAddress, setDeliveryAddress] = useState(initialData?.delivery_address ?? "")

  const [bouquetData, setBouquetData] = useState<BouquetData | null>(null)
  const [subtotal, setSubtotal] = useState(initialData?.subtotal != null ? String(initialData.subtotal) : "")
  const [deliveryCost, setDeliveryCost] = useState(initialData?.delivery_cost ? String(initialData.delivery_cost) : "")
  const [discount, setDiscount] = useState(initialData?.discount ? String(initialData.discount) : "")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>((initialData?.payment_method as PaymentMethod) ?? "cash")
  const [paidAmount, setPaidAmount] = useState(initialData?.paid_amount ? String(initialData.paid_amount) : "")

  const [customerComment, setCustomerComment] = useState(initialData?.customer_comment ?? "")
  const [floristComment, setFloristComment] = useState(initialData?.florist_comment ?? "")

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
    setError("")

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
        router.push(`/orders/${initialData.id}`)
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

      {/* Клиент + Детали */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${
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
      </div>

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
          initialItems={initialData?.bouquet?.items.map((item) => {
            const f = flowers.find((fl) => fl.id === item.flower_id)
            return {
              flower_id: item.flower_id ?? "",
              name: f?.name ?? "",
              unit: f?.unit ?? "шт",
              quantity: item.quantity,
              unit_cost: item.unit_cost ?? 0,
            }
          })}
          initialSalePrice={initialData?.bouquet?.sale_price ?? undefined}
        />
      </div>

      {/* Финансы */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
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
                  className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-all ${
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
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          disabled={isPending}
          className="bg-rose-500 hover:bg-rose-600 text-white h-10 px-6"
        >
          {isPending ? (isEdit ? "Сохраняем..." : "Создаём заказ...") : (isEdit ? "Сохранить изменения" : "Создать заказ")}
        </Button>
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
