"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { updateOrderStatus, updateOrderPayment, cancelOrder } from "@/app/actions/orders"
import { useOrderDirty } from "@/components/orders/OrderDetailShell"

type Status = "new" | "in_progress" | "ready" | "delivered" | "cancelled"

const STATUS_TRANSITIONS: Record<Status, { next?: Status; nextLabel?: string; canCancel: boolean }> = {
  new: { next: "in_progress", nextLabel: "Взять в работу", canCancel: true },
  in_progress: { next: "ready", nextLabel: "Готов к выдаче", canCancel: true },
  ready: { next: "delivered", nextLabel: "Выдан клиенту", canCancel: true },
  delivered: { canCancel: true },
  cancelled: { canCancel: false },
}

interface Props {
  orderId: string
  status: Status
  totalAmount: number
  paidAmount: number
  paymentMethod: string | null
}

export function OrderStatusActions({ orderId, status, totalAmount, paidAmount, paymentMethod }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { isDirty } = useOrderDirty()

  const transition = STATUS_TRANSITIONS[status]

  function advance() {
    if (isDirty) return
    if (!transition.next) return
    startTransition(async () => {
      await updateOrderStatus(orderId, transition.next!)
      router.refresh()
    })
  }

  function cancel() {
    if (isDirty) return
    const message =
      paidAmount > 0
        ? `По заказу уже есть оплата: ${paidAmount} ₸.\nОтменить заказ?\n\nВажно: возврат денег нужно оформить отдельно.`
        : "Отменить заказ?"
    if (!confirm(message)) return
    startTransition(async () => {
      const result = await cancelOrder(orderId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      router.refresh()
    })
  }

  function markPaid() {
    if (isDirty) return
    startTransition(async () => {
      await updateOrderPayment(orderId, {
        payment_method: paymentMethod ?? "cash",
        paid_amount: totalAmount,
        total_amount: totalAmount,
      })
      router.refresh()
    })
  }

  const canMarkPaid = paidAmount < totalAmount && totalAmount > 0

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {transition.next && (
        <button
          onClick={advance}
          disabled={isPending || isDirty}
          className="flex items-center gap-1.5 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-hover)] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {isPending ? "..." : transition.nextLabel}
        </button>
      )}
      {canMarkPaid && status !== "cancelled" && (
        <button
          onClick={markPaid}
          disabled={isPending || isDirty}
          className="flex items-center gap-1.5 bg-[var(--sage)] hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Принять оплату
        </button>
      )}
      {transition.canCancel && (
        <button
          onClick={cancel}
          disabled={isPending || isDirty}
          className="flex items-center gap-1.5 border border-destructive/30 hover:bg-destructive/10 disabled:opacity-50 text-destructive text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Отменить
        </button>
      )}
    </div>
    </div>
  )
}
