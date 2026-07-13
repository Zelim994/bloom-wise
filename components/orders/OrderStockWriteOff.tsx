"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { writeOffOrderStock } from "@/app/actions/orders"
import { PackageCheck, PackageX } from "lucide-react"

type Props = {
  orderId: string
  stockWrittenOff: boolean
  stockReturned: boolean
  status: string
}

export function OrderStockWriteOff({ orderId, stockWrittenOff, stockReturned, status }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleWriteOff() {
    setError(null)
    startTransition(async () => {
      const result = await writeOffOrderStock(orderId)
      if (!result.ok) { setError(result.error) } else { router.refresh() }
    })
  }

  if (stockReturned) {
    return (
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[var(--sage-bg)] border border-[var(--sage)] w-fit">
        <PackageCheck className="h-4 w-4 text-[var(--sage)] shrink-0" />
        <span className="text-sm font-medium text-[var(--sage-text)]">Склад возвращён — цветы были возвращены на склад после отмены заказа</span>
      </div>
    )
  }

  if (stockWrittenOff) {
    return (
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[var(--sage-bg)] border border-[var(--sage)] w-fit">
        <PackageCheck className="h-4 w-4 text-[var(--sage)] shrink-0" />
        <span className="text-sm font-medium text-[var(--sage-text)]">Склад списан</span>
      </div>
    )
  }

  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] w-fit">
        <PackageX className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
        <span className="text-sm text-[var(--text-secondary)]">Склад не списан — заказ отменён</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-[var(--warn-bg)] border border-[var(--warn)]">
          <PackageX className="h-4 w-4 text-[var(--warn)] shrink-0" />
          <span className="text-sm text-[var(--warn-text)]">Склад не списан</span>
        </div>
        <button onClick={handleWriteOff} disabled={isPending}
          className="flex items-center gap-1.5 bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-hover)] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {isPending ? "Списываем..." : "Списать склад"}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
