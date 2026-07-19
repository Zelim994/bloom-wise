"use client"

import { createContext, useContext, useState } from "react"

type OrderDirtyContextValue = {
  isDirty: boolean
  setDirty: (dirty: boolean) => void
}

const OrderDirtyContext = createContext<OrderDirtyContextValue | null>(null)

export function useOrderDirty(): OrderDirtyContextValue {
  const ctx = useContext(OrderDirtyContext)
  if (!ctx) {
    throw new Error("useOrderDirty must be used within an OrderDetailShell")
  }
  return ctx
}

// Tolerant variant for components rendered both inside and outside the shell
// (OrderForm is also used on the order-creation page, which has no shell).
export function useOptionalOrderDirty(): OrderDirtyContextValue | null {
  return useContext(OrderDirtyContext)
}

export function OrderDetailShell({ children }: { children: React.ReactNode }) {
  const [isDirty, setDirty] = useState(false)

  return (
    <OrderDirtyContext.Provider value={{ isDirty, setDirty }}>
      {isDirty && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-0.5 rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] px-3.5 py-2.5"
        >
          <p className="text-sm font-semibold text-[var(--warn-text)]">Есть несохранённые изменения</p>
          <p className="text-sm text-[var(--warn-text)]">Сохраните заказ, чтобы продолжить работу со статусом и складом.</p>
        </div>
      )}
      {children}
    </OrderDirtyContext.Provider>
  )
}
