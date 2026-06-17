type Props = {
  stockWrittenOff: boolean
  stockReturned: boolean
}

export function OrderStockBadge({ stockWrittenOff, stockReturned }: Props) {
  if (stockReturned) {
    return (
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-600">
        Склад возвращён
      </span>
    )
  }
  if (stockWrittenOff) {
    return (
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        Склад списан
      </span>
    )
  }
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-400">
      Склад не списан
    </span>
  )
}
