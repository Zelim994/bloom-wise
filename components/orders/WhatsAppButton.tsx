"use client"

import { useState } from "react"
import { MessageCircle, Check, Loader2 } from "lucide-react"
import { sendWhatsAppMessage } from "@/app/actions/orders"

interface Props {
  orderId: string
  phone: string
  orderNumber: string
  totalAmount: number
  readyAt: string | null
  customerName: string | null
}

function buildMessage(
  orderNumber: string,
  totalAmount: number,
  readyAt: string | null,
  customerName: string | null
): string {
  const name = customerName ? `${customerName}, з` : "З"
  const ready = readyAt
    ? new Date(readyAt).toLocaleString("ru", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  const lines = [
    `${name}дравствуйте! 🌸`,
    `Ваш заказ ${orderNumber} на сумму ₽${totalAmount.toLocaleString("ru", { maximumFractionDigits: 0 })} оформлен.`,
  ]
  if (ready) lines.push(`Готов: ${ready}.`)
  lines.push("Ждём вас!")
  return lines.join("\n")
}

export function WhatsAppButton({
  orderId,
  phone,
  orderNumber,
  totalAmount,
  readyAt,
  customerName,
}: Props) {
  const [loading, setLoading] = useState(false)
  // "opened" tracks only that a WhatsApp deep link was successfully handed
  // off to the browser via window.open in THIS session — BloomWise has no
  // provider integration, so it can never know whether the user went on to
  // actually press Send inside WhatsApp. It always starts false: the
  // persisted orders.whatsapp_sent flag only proves a past handoff attempt
  // was logged, never that window.open succeeded, so it must never seed
  // this state — doing so would show "WhatsApp открыт" on a fresh page
  // load with no evidence a popup ever opened in this session.
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!phone.trim()) return null

  async function handleClick() {
    setLoading(true)
    setError(null)
    const message = buildMessage(orderNumber, totalAmount, readyAt, customerName)
    const result = await sendWhatsAppMessage(orderId, phone, message)
    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }
    if (!result.url) return

    // Only count this as "opened" once window.open actually hands off —
    // a blocked popup means the DB handoff attempt was logged, but nothing
    // was ever shown to the user, so it must not be presented as opened.
    const openedWindow = window.open(result.url, "_blank", "noopener,noreferrer")
    if (openedWindow) {
      setOpened(true)
    } else {
      setError("Не удалось открыть WhatsApp. Разрешите всплывающие окна и попробуйте снова.")
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
          opened
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
        }`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : opened ? (
          <Check className="h-4 w-4" />
        ) : (
          <MessageCircle className="h-4 w-4" />
        )}
        {opened ? "WhatsApp открыт" : "Открыть WhatsApp"}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
