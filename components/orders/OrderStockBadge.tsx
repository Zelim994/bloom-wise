type Props = {
  stockWrittenOff: boolean
  stockReturned: boolean
}

export function OrderStockBadge({ stockWrittenOff, stockReturned }: Props) {
  if (stockReturned) {
    return (
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
        Склад возвращён
      </span>
    )
  }
  if (stockWrittenOff) {
    return (
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--sage-bg)] text-[var(--sage-text)]">
        Склад списан
      </span>
    )
  }
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--warn-bg)] text-[var(--warn-text)]">
      Склад не списан
    </span>
  )
}
