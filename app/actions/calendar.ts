"use server"

import { createClient } from "@/lib/supabase/server"

export type CalendarOrder = {
  id: string
  order_number: string | null
  status: string
  type: string | null
  total_amount: number | null
  ready_at: string | null
  order_date: string
  customers: { full_name: string; phone: string | null } | null
}

export async function getOrdersForCalendar(): Promise<CalendarOrder[]> {
  const supabase = await createClient()

  const from = new Date()
  from.setDate(from.getDate() - 3)

  const to = new Date()
  to.setDate(to.getDate() + 30)

  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

  const { data } = await supabase
    .from("orders")
    .select("id, order_number, status, type, total_amount, ready_at, order_date, customers(full_name, phone)")
    .neq("status", "cancelled")
    .or(`order_date.gte.${fromStr},ready_at.gte.${fromStr}`)
    .lte("order_date", toStr)
    .order("ready_at", { ascending: true, nullsFirst: false })
    .order("order_date", { ascending: true })
    .limit(300)

  return (data ?? []) as unknown as CalendarOrder[]
}
