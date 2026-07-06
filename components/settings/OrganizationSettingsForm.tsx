"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateOrganizationSettings, uploadOrganizationLogo, type OrgSettingsInput } from "@/app/actions/settings"

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

export function OrganizationSettingsForm({
  initial,
  logoUrl,
  canManageSettings,
}: {
  initial: OrgSettingsInput
  logoUrl?: string | null
  canManageSettings: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState<OrgSettingsInput>(initial)
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [isPending, startTransition] = useTransition()

  // Logo upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(logoUrl ?? null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoStatus, setLogoStatus] = useState<"idle" | "success" | "error">("idle")
  const [logoError, setLogoError] = useState("")
  const [isLogoUploading, startLogoTransition] = useTransition()

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setLogoFile(file)
    setLogoStatus("idle")
    if (file) setPreviewUrl(URL.createObjectURL(file))
  }

  const handleLogoUpload = () => {
    if (!logoFile) {
      setLogoStatus("error")
      setLogoError("Выберите файл")
      return
    }
    setLogoStatus("idle")
    startLogoTransition(async () => {
      const fd = new FormData()
      fd.append("logo", logoFile)
      const result = await uploadOrganizationLogo(fd)
      if (result.error) {
        setLogoStatus("error")
        setLogoError(result.error)
      } else {
        setLogoStatus("success")
        setLogoFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
        // Cache-bust so the browser loads the updated image
        setPreviewUrl((result.url ?? "") + "?t=" + Date.now())
        // Обновить shared dashboard layout (Sidebar), чтобы новый логотип
        // подхватился без hard reload
        router.refresh()
      }
    })
  }

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
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-8 max-w-lg">
      {/* Баннер для ролей без прав */}
      {!canManageSettings && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          У вас нет прав на изменение настроек организации. Вы можете просматривать данные, но редактирование доступно только владельцу или администратору.
        </div>
      )}

      {/* Логотип салона */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-700">Логотип салона</h2>
        <div className="flex items-center gap-5">
          {/* Preview */}
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden">
            {previewUrl ? (
              <>
                {/* Preview may be a blob: URL from a local file before upload. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Логотип" className="h-full w-full object-cover" />
              </>
            ) : (
              <span className="text-3xl">🌸</span>
            )}
          </div>
          {/* Controls */}
          <div className={`space-y-2 ${!canManageSettings ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2">
              <label className={`rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors ${canManageSettings ? "cursor-pointer hover:border-zinc-300" : "cursor-not-allowed"}`}>
                Выбрать файл
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!canManageSettings}
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </label>
              <button
                type="button"
                onClick={handleLogoUpload}
                disabled={isLogoUploading || !logoFile || !canManageSettings}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLogoUploading ? "Загрузка..." : "Загрузить"}
              </button>
            </div>
            <p className="text-[11px] text-zinc-400">PNG, JPG, WEBP до 2 МБ</p>
            {logoFile && logoStatus === "idle" && (
              <p className="text-[11px] text-zinc-500 truncate max-w-[200px]">{logoFile.name}</p>
            )}
            {logoStatus === "success" && (
              <p className="text-[11px] text-green-600">✓ Логотип сохранён</p>
            )}
            {logoStatus === "error" && (
              <p className="text-[11px] text-red-500">{logoError}</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100" />

    <form onSubmit={handleSubmit} className="space-y-6">
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
            readOnly={!canManageSettings}
            className={`${inputCn} ${!canManageSettings ? "cursor-not-allowed opacity-60" : ""}`}
            placeholder="Цветочный салон"
          />
        </Field>

        <Field label="Телефон салона">
          <input
            type="tel"
            value={form.orgPhone}
            onChange={set("orgPhone")}
            readOnly={!canManageSettings}
            className={`${inputCn} ${!canManageSettings ? "cursor-not-allowed opacity-60" : ""}`}
            placeholder="+7 999 000-00-00"
          />
        </Field>

        <Field label="WhatsApp">
          <input
            type="tel"
            value={form.orgWhatsapp}
            onChange={set("orgWhatsapp")}
            readOnly={!canManageSettings}
            className={`${inputCn} ${!canManageSettings ? "cursor-not-allowed opacity-60" : ""}`}
            placeholder="+7 999 000-00-00"
          />
        </Field>

        <Field label="Адрес">
          <input
            type="text"
            value={form.orgAddress}
            onChange={set("orgAddress")}
            readOnly={!canManageSettings}
            className={`${inputCn} ${!canManageSettings ? "cursor-not-allowed opacity-60" : ""}`}
            placeholder="г. Москва, ул. Цветочная, 1"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Валюта">
            <select
              value={form.currency}
              onChange={set("currency")}
              disabled={!canManageSettings}
              className={`${inputCn} ${!canManageSettings ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Часовой пояс">
            <select
              value={form.timezone}
              onChange={set("timezone")}
              disabled={!canManageSettings}
              className={`${inputCn} ${!canManageSettings ? "cursor-not-allowed opacity-60" : ""}`}
            >
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
            readOnly={!canManageSettings}
            className={`${inputCn} ${!canManageSettings ? "cursor-not-allowed opacity-60" : ""}`}
            placeholder="Иван Иванов"
          />
        </Field>

        <Field label="Телефон">
          <input
            type="tel"
            value={form.ownerPhone}
            onChange={set("ownerPhone")}
            readOnly={!canManageSettings}
            className={`${inputCn} ${!canManageSettings ? "cursor-not-allowed opacity-60" : ""}`}
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
        disabled={isPending || !canManageSettings}
        className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Сохранение..." : "Сохранить"}
      </button>
    </form>
    </div>
  )
}
