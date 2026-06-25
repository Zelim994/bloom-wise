"use client"

import { useState, useTransition } from "react"
import { updateOrganizationSettings, type OrgSettingsInput } from "@/app/actions/settings"

const CURRENCIES = [
  { value: "RUB", label: "₽ Рубль (RUB)" },
  { value: "USD", label: "$ Доллар (USD)" },
  { value: "EUR", label: "€ Евро (EUR)" },
]

const TIMEZONES = [
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Asia/Dubai", label: "Дубай (UTC+4)" },
  { value: "Europe/Istanbul", label: "Стамбул (UTC+3)" },
  { value: "Asia/Tbilisi", label: "Тбилиси (UTC+4)" },
]

const inputCn =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200 transition-colors"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-zinc-500">{label}</label>
      {children}
    </div>
  )
}

export function OrganizationSettingsForm({ initial }: { initial: OrgSettingsInput }) {
  const [form, setForm] = useState<OrgSettingsInput>(initial)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [isPending, startTransition] = useTransition()

  const set =
    (key: keyof OrgSettingsInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.orgName.trim()) {
      setStatus("error")
      setErrorMsg("Название салона обязательно")
      return
    }
    setStatus("idle")
    startTransition(async () => {
      const result = await updateOrganizationSettings(form)
      if (result.error) {
        setStatus("error")
        setErrorMsg(result.error)
      } else {
        setStatus("success")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {/* Данные салона */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-700">Данные салона</h2>

        <Field label="Название салона *">
          <input
            type="text"
            value={form.orgName}
            onChange={set("orgName")}
            required
            maxLength={100}
            className={inputCn}
            placeholder="Цветочный салон"
          />
        </Field>

        <Field label="Телефон салона">
          <input
            type="tel"
            value={form.orgPhone}
            onChange={set("orgPhone")}
            className={inputCn}
            placeholder="+7 999 000-00-00"
          />
        </Field>

        <Field label="WhatsApp">
          <input
            type="tel"
            value={form.orgWhatsapp}
            onChange={set("orgWhatsapp")}
            className={inputCn}
            placeholder="+7 999 000-00-00"
          />
        </Field>

        <Field label="Адрес">
          <input
            type="text"
            value={form.orgAddress}
            onChange={set("orgAddress")}
            className={inputCn}
            placeholder="г. Москва, ул. Цветочная, 1"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Валюта">
            <select value={form.currency} onChange={set("currency")} className={inputCn}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Часовой пояс">
            <select value={form.timezone} onChange={set("timezone")} className={inputCn}>
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="border-t border-zinc-100" />

      {/* Данные владельца */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-700">Данные владельца</h2>

        <Field label="Имя">
          <input
            type="text"
            value={form.ownerFullName}
            onChange={set("ownerFullName")}
            className={inputCn}
            placeholder="Иван Иванов"
          />
        </Field>

        <Field label="Телефон">
          <input
            type="tel"
            value={form.ownerPhone}
            onChange={set("ownerPhone")}
            className={inputCn}
            placeholder="+7 999 000-00-00"
          />
        </Field>
      </div>

      {status === "success" && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          ✓ Данные сохранены
        </p>
      )}
      {status === "error" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
      >
        {isPending ? "Сохранение..." : "Сохранить"}
      </button>
    </form>
  )
}
