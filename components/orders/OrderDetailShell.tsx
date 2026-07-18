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
      {children}
    </OrderDirtyContext.Provider>
  )
}
