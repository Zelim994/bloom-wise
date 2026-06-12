import { Plus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getCustomers } from "@/app/actions/orders"

export default async function CustomersPage() {
  const customers = await getCustomers()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-500">
          <Users className="h-4 w-4" />
          {customers.length} {customers.length === 1 ? "клиент" : customers.length >= 2 && customers.length <= 4 ? "клиента" : "клиентов"}
        </div>
        <Button className="bg-rose-500 hover:bg-rose-600 text-white gap-2">
          <Plus className="h-4 w-4" />
          Новый клиент
        </Button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {customers.length === 0 ? (
          <div className="flex flex.col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500">Клиенты пока не добавлены</p>
            <p className="text-xs text-zinc-400 mt-1">Клиент создаётся автоматически при оформлении заказа</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Имя</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Телефон</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">Средний чек</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr
                  key={c.id}
                  className={`border-b border-zinc-50 hover:bg-zinc-50 cursor-pointer ${i === customers.length - 1 ? "border-0" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-800">{c.full_name}</td>
                  <td className="px-4 py-3 text-zinc-500">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-800">
                    {c.avg_check != null ? `₽${c.avg_check.toLocaleString("ru", { maximumFractionDigits: 0 })}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
