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
  alreadySent: boolean
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
  alreadySent,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(alreadySent)

  if (!phone.trim()) return null

  async function handleClick() {
    setLoading(true)
    const message = buildMessage(orderNumber, totalAmount, readyAt, customerName)
    const result = await sendWhatsAppMessage(orderId, phone, message)
    setLoading(false)

    if (result.url) {
      setSent(true)
      window.open(result.url, "_blank", "noopener,noreferrer")
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
        sent
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
      }`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : sent ? (
        <Check className="h-4 w-4" />
      ) : (
        <MessageCircle className="h-4 w-4" />
      )}
      {sent ? "Отправлено" : "WhatsApp"}
    </button>
  )
}
