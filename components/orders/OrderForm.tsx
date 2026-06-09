"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, User, Phone, MapPin, CreditCard, MessageSquare, Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createOrder, type BouquetPayload } from "@/app/actions/orders"
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
}

export function OrderForm({ flowers }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const [customerPhone, setCustomerPhone] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerFound, setCustomerFound] = useState<boolean | null>(null)
  const [lookingUp, setLookingUp] = useState(false)

  const [orderType, setOrderType] = useState<OrderType>("pickup")
  const [orderDate] = useState(today())
  const [readyAt, setReadyAt] = useState(defaultReadyAt())
  const [deliveryAddress, setDeliveryAddress] = useState("")

  const [bouquetData, setBouquetData] = useState<BouquetData | null>(null)
  const [subtotal, setSubtotal] = useState("")
  const [deliveryCost, setDeliveryCost] = useState("")
  const [discount, setDiscount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [paidAmount, setPaidAmount] = useState("")

  const [customerComment, setCustomerComment] = useState("")
  const [floristComment, setFloristComment] = useState("")

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

  async function handlePhoneBlur() {
    const phone = customerPhone.trim()
    if (!phone || phone.length < 7) return
    setLookingUp(true)
    const { findCustomerByPhone } = await import("@/app/actions/orders")
    const found = await findCustomerByPhone(phone)
    if (found) {
      setCustomerName(found.full_name)
      setCustomerFound(true)
    } else {
      setCustomerFound(false)
    }
    setLookingUp(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!customerName.trim() && !customerPhone.trim()) {
      setError("Укажите клиента — имя или телефон")
      return
    }

    const bouquet: BouquetPayload | undefined =
      bouquetData && bouquetData.items.length > 0 ? bouquetData : undefined

    startTransition(async () => {
      const result = await createOrder({
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
      })

      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/orders/${result.id}`)
      router.refresh()
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
                onChange={(e) => { setCustomerPhone(e.target.value); setCustomerFound(null) }}
                onBlur={handlePhoneBlur}
                placeholder="+7 900 000-00-00"
                className="border-zinc-200 h-10 pl-9"
              />
            </div>
            {lookingUp && <p className="text-xs text-zinc-400">Ищем клиента...</p>}
            {customerFound === true && <p className="text-xs text-emerald-600">Клиент найден — имя заполнено автоматически</p>}
            {customerFound === false && <p className="text-xs text-amber-600">Новый клиент — будет создан при сохранении</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Имя клиента *
            </Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Анна Иванова"
              className="border-zinc-200 h-10"
            />
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
        <BuilderLayout flowers={flowers} onChange={handleBouquetChange} />
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
          {isPending ? "Создаём заказ..." : "Создать заказ"}
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
