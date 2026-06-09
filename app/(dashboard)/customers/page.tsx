import { Plus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"

const mockCustomers = [
  { id: "C-01", name: "Анна Михайлова", phone: "+7 900 123-45-67", orders: 8, avgCheck: "₽ 5 200", lastOrder: "07.06.2026" },
  { id: "C-02", name: "Иван Ковалёв", phone: "+7 912 234-56-78", orders: 3, avgCheck: "₽ 8 900", lastOrder: "07.06.2026" },
  { id: "C-03", name: "Мария Соколова", phone: "+7 925 345-67-89", orders: 12, avgCheck: "₽ 4 100", lastOrder: "06.06.2026" },
  { id: "C-04", name: "Ольга Виноградова", phone: "+7 916 456-78-90", orders: 5, avgCheck: "₽ 12 500", lastOrder: "06.06.2026" },
]

export default function CustomersPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-500">
          <Users className="h-4 w-4" />
          {mockCustomers.length} клиента
        </div>
        <Button className="bg-rose-500 hover:bg-rose-600 text-white gap-2">
          <Plus className="h-4 w-4" />
          Новый клиент
        </Button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Имя</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Телефон</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">Заказов</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">Средний чек</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">Последний заказ</th>
            </tr>
          </thead>
          <tbody>
            {mockCustomers.map((c, i) => (
              <tr key={c.id} className={`border-b border-zinc-50 hover:bg-zinc-50 cursor-pointer ${i === mockCustomers.length - 1 ? "border-0" : ""}`}>
                <td className="px-4 py-3 font-medium text-zinc-800">{c.name}</td>
                <td className="px-4 py-3 text-zinc-500">{c.phone}</td>
                <td className="px-4 py-3 text-right text-zinc-600">{c.orders}</td>
                <td className="px-4 py-3 text-right font-semibold text-zinc-800">{c.avgCheck}</td>
                <td className="px-4 py-3 text-right text-zinc-400">{c.lastOrder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
