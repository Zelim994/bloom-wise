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
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-sky-50 border border-sky-200 w-fit">
        <PackageCheck className="h-4 w-4 text-sky-600 shrink-0" />
        <span className="text-sm font-medium text-sky-700">Склад возвращён — цветы были возвращены на склад после отмены заказа</span>
      </div>
    )
  }

  if (stockWrittenOff) {
    return (
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 w-fit">
        <PackageCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="text-sm font-medium text-emerald-700">Склад списан</span>
      </div>
    )
  }

  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 w-fit">
        <PackageX className="h-4 w-4 text-zinc-400 shrink-0" />
        <span className="text-sm text-zinc-500">Склад не списан — заказ отменён</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
          <PackageX className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-700">Склад не списан</span>
        </div>
        <button onClick={handleWriteOff} disabled={isPending}
          className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {isPending ? "Списываем..." : "Списать склад"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
