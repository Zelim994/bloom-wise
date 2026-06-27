"use client"

import { useState, useTransition } from "react"
import { Plus, Pencil, ToggleLeft, ToggleRight, X, Check } from "lucide-react"
import {
  createSupplier,
  updateSupplier,
  toggleSupplierActive,
  type SupplierInput,
  type SupplierRow,
} from "@/app/actions/suppliers"

const inputCn =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200 transition-colors"

const EMPTY: SupplierInput = {
  name: "",
  phone: "",
  email: "",
  contact_person: "",
  address: "",
  payment_terms: "",
  comment: "",
}

function SupplierFormPanel({
  initial,
  onSave,
  onCancel,
}: {
  initial: SupplierInput & { id?: string }
  onSave: (data: SupplierInput, id?: string) => Promise<string | null>
  onCancel: () => void
}) {
  const [form, setForm] = useState<SupplierInput>({
    name: initial.name,
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    contact_person: initial.contact_person ?? "",
    address: initial.address ?? "",
    payment_terms: initial.payment_terms ?? "",
    comment: initial.comment ?? "",
  })
  const [error, setError] = useState("")
  const [isPending, start] = useTransition()

  const set =
    (key: keyof SupplierInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError("Название обязательно"); return }
    setError("")
    start(async () => {
      const err = await onSave(form, initial.id)
      if (err) setError(err)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-zinc-700">
        {initial.id ? "Редактировать поставщика" : "Новый поставщик"}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 space-y-1">
          <label className="block text-xs font-medium text-zinc-500">Название *</label>
          <input className={inputCn} value={form.name} onChange={set("name")} maxLength={200} placeholder="ООО Цветочный мир" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500">Телефон</label>
          <input className={inputCn} type="tel" value={form.phone} onChange={set("phone")} placeholder="+7 999 000-00-00" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500">Email</label>
          <input className={inputCn} type="email" value={form.email} onChange={set("email")} placeholder="info@supplier.ru" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500">Контактное лицо</label>
          <input className={inputCn} value={form.contact_person} onChange={set("contact_person")} placeholder="Иван Петров" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-500">Условия оплаты</label>
          <input className={inputCn} value={form.payment_terms} onChange={set("payment_terms")} placeholder="Предоплата 50%" />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <label className="block text-xs font-medium text-zinc-500">Адрес</label>
          <input className={inputCn} value={form.address} onChange={set("address")} placeholder="г. Москва, ул. Оптовая, 1" />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <label className="block text-xs font-medium text-zinc-500">Комментарий</label>
          <textarea
            className={`${inputCn} resize-none`}
            rows={2}
            value={form.comment}
            onChange={set("comment")}
            placeholder="Доп. информация о поставщике"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          {isPending ? "Сохранение..." : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-600 hover:border-zinc-300 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Отмена
        </button>
      </div>
    </form>
  )
}

export function SuppliersClient({
  suppliers: initial,
  canManage,
}: {
  suppliers: SupplierRow[]
  canManage: boolean
}) {
  const [suppliers, setSuppliers] = useState(initial)
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState("")
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [, startToggle] = useTransition()

  const refreshRow = (updated: SupplierRow) =>
    setSuppliers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))

  const handleSave = async (data: SupplierInput, id?: string): Promise<string | null> => {
    const result = id ? await updateSupplier(id, data) : await createSupplier(data)
    if (result.error) return result.error

    if (id) {
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, ...data, phone: data.phone || null, email: data.email || null, contact_person: data.contact_person || null, address: data.address || null, payment_terms: data.payment_terms || null, comment: data.comment || null }
            : s
        )
      )
      setEditId(null)
    } else {
      setShowCreate(false)
    }
    return null
  }

  const handleToggle = (supplier: SupplierRow) => {
    setTogglingId(supplier.id)
    startToggle(async () => {
      const result = await toggleSupplierActive(supplier.id, !supplier.is_active)
      if (result.error) {
        setGlobalError(result.error)
      } else {
        refreshRow({ ...supplier, is_active: !supplier.is_active })
      }
      setTogglingId(null)
    })
  }

  return (
    <div className="space-y-4">
      {globalError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{globalError}</p>
      )}

      {canManage && !showCreate && (
        <button
          onClick={() => { setShowCreate(true); setEditId(null) }}
          className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Добавить поставщика
        </button>
      )}

      {showCreate && canManage && (
        <SupplierFormPanel
          initial={EMPTY}
          onSave={handleSave}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {suppliers.length === 0 && !showCreate && (
        <p className="text-sm text-zinc-400">Поставщики пока не добавлены.</p>
      )}

      <div className="space-y-2">
        {suppliers.map((s) => (
          <div key={s.id}>
            {editId === s.id && canManage ? (
              <SupplierFormPanel
                initial={{ id: s.id, name: s.name, phone: s.phone ?? "", email: s.email ?? "", contact_person: s.contact_person ?? "", address: s.address ?? "", payment_terms: s.payment_terms ?? "", comment: s.comment ?? "" }}
                onSave={handleSave}
                onCancel={() => setEditId(null)}
              />
            ) : (
              <div
                className={`flex items-start gap-4 rounded-xl border bg-white px-4 py-3 transition-opacity ${
                  s.is_active ? "border-zinc-200" : "border-zinc-100 opacity-50"
                }`}
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-zinc-800">{s.name}</p>
                  {s.contact_person && (
                    <p className="text-xs text-zinc-400">{s.contact_person}</p>
                  )}
                  {(s.phone || s.email) && (
                    <p className="text-xs text-zinc-400">
                      {[s.phone, s.email].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {s.payment_terms && (
                    <p className="text-xs text-zinc-400">Оплата: {s.payment_terms}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={`text-[11px] font-medium ${
                      s.is_active ? "text-green-600" : "text-zinc-400"
                    }`}
                  >
                    {s.is_active ? "Активен" : "Отключён"}
                  </span>

                  {canManage && (
                    <>
                      <button
                        title="Редактировать"
                        onClick={() => { setEditId(s.id); setShowCreate(false) }}
                        className="ml-2 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title={s.is_active ? "Деактивировать" : "Активировать"}
                        onClick={() => handleToggle(s)}
                        disabled={togglingId === s.id}
                        className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 transition-colors"
                      >
                        {s.is_active
                          ? <ToggleRight className="h-4 w-4 text-green-500" />
                          : <ToggleLeft className="h-4 w-4" />
                        }
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
