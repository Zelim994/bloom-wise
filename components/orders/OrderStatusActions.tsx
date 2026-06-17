"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { updateOrderStatus, updateOrderPayment, cancelOrder } from "@/app/actions/orders"

type Status = "new" | "in_progress" | "ready" | "delivered" | "cancelled"

const STATUS_LABELS: Record<Status, string> = {
  new: "Новый",
  in_progress: "В работе",
  ready: "Готов",
  delivered: "Выдан",
  cancelled: "Отменён",
}

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

  const transition = STATUS_TRANSITIONS[status]

  function advance() {
    if (!transition.next) return
    startTransition(async () => {
      await updateOrderStatus(orderId, transition.next!)
      router.refresh()
    })
  }

  function cancel() {
    if (!confirm("Отменить заказ?")) return
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {transition.next && (
        <button
          onClick={advance}
          disabled={isPending}
          className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {isPending ? "..." : transition.nextLabel}
        </button>
      )}
      {canMarkPaid && status !== "cancelled" && (
        <button
          onClick={markPaid}
          disabled={isPending}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Принять оплату
        </button>
      )}
      {transition.canCancel && (
        <button
          onClick={cancel}
          disabled={isPending}
          className="flex items-center gap-1.5 border border-zinc-200 hover:border-red-200 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 text-zinc-500 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Отменить
        </button>
      )}
    </div>
    </div>
  )
}
