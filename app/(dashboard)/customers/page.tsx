import { Users } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import {
  CustomersListClient,
  type CustomerWithOrders,
} from "@/components/customers/CustomersListClient"

function pluralClients(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "клиент"
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "клиента"
  return "клиентов"
}

export default async function CustomersPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from("customers")
    .select(
      "id, full_name, phone, whatsapp, avg_check, comment, created_at, orders(id, order_number, total_amount, order_date, status)"
    )
    .order("full_name")

  const customers = (data ?? []) as unknown as CustomerWithOrders[]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-zinc-900">Клиенты</h1>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-500">
          <Users className="h-4 w-4" />
          {customers.length} {pluralClients(customers.length)}
        </div>
      </div>

      <CustomersListClient customers={customers} />
    </div>
  )
}
