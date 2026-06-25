"use client"

import { useState, useTransition } from "react"
import { createTeamInvitation, revokeTeamInvitation } from "@/app/actions/invitations"
import { ROLE_LABELS, type TeamRole } from "@/lib/team/roles"

type ActiveInvitation = {
  id: string
  role: string
  invited_name: string | null
  invited_phone: string | null
  invited_email: string | null
  token: string
  expires_at: string
  created_at: string
}

type Props = {
  invitations: ActiveInvitation[]
  currentUserRole: "owner" | "admin"
}

const availableRoles = (userRole: "owner" | "admin"): TeamRole[] =>
  userRole === "owner"
    ? ["admin", "florist", "cashier", "viewer"]
    : ["florist", "cashier", "viewer"]

function formatExpiry(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function TeamInvitationsPanel({ invitations, currentUserRole }: Props) {
  const roles = availableRoles(currentUserRole)

  // ── Форма ──────────────────────────────────────────────────────────────────
  const [role, setRole] = useState<TeamRole>(roles[0])
  const [invitedName, setInvitedName] = useState("")
  const [invitedPhone, setInvitedPhone] = useState("")
  const [invitedEmail, setInvitedEmail] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Статус копирования ─────────────────────────────────────────────────────
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ── Ошибки отзыва ─────────────────────────────────────────────────────────
  const [revokeErrors, setRevokeErrors] = useState<Record<string, string>>({})
  const [revoking, setRevoking] = useState<string | null>(null)

  async function copyLink(token: string, id: string) {
    const url = `${window.location.origin}/invite/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setCopiedId(`err:${id}`)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setCreatedToken(null)
    startTransition(async () => {
      const result = await createTeamInvitation({
        role,
        invitedName: invitedName || undefined,
        invitedPhone: invitedPhone || undefined,
        invitedEmail: invitedEmail || undefined,
      })
      if (result.error) {
        setFormError(result.error)
      } else if (result.data) {
        setCreatedToken(result.data.token)
        setInvitedName("")
        setInvitedPhone("")
        setInvitedEmail("")
      }
    })
  }

  function handleRevoke(id: string) {
    setRevokeErrors((prev) => ({ ...prev, [id]: "" }))
    setRevoking(id)
    startTransition(async () => {
      const result = await revokeTeamInvitation(id)
      setRevoking(null)
      if (result.error) {
        setRevokeErrors((prev) => ({ ...prev, [id]: result.error! }))
      }
    })
  }

  const inputCn =
    "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200 transition-colors"

  return (
    <div className="space-y-6">

      {/* ── Форма создания ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-zinc-800">Пригласить сотрудника</h2>

        <form onSubmit={handleCreate} className="space-y-3">
          {/* Роль */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Роль</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as TeamRole)}
              disabled={isPending}
              className={`${inputCn} cursor-pointer`}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {/* Имя */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Имя сотрудника</label>
            <input
              type="text"
              placeholder="Анна Иванова"
              value={invitedName}
              onChange={(e) => setInvitedName(e.target.value)}
              disabled={isPending}
              className={inputCn}
            />
          </div>

          {/* Телефон */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Телефон</label>
            <input
              type="tel"
              placeholder="+7 900 000 00 00"
              value={invitedPhone}
              onChange={(e) => setInvitedPhone(e.target.value)}
              disabled={isPending}
              className={inputCn}
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Email</label>
            <input
              type="email"
              placeholder="florist@salon.ru"
              value={invitedEmail}
              onChange={(e) => setInvitedEmail(e.target.value)}
              disabled={isPending}
              className={inputCn}
            />
          </div>

          {formError && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            {isPending ? "Создаём..." : "Создать приглашение"}
          </button>
        </form>

        {/* ── Успех: показать ссылку ──────────────────────────────────────── */}
        {createdToken && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
            <p className="text-sm font-medium text-green-800">Приглашение создано</p>
            <p className="text-xs text-zinc-500 break-all font-mono bg-white rounded-lg px-3 py-2 border border-zinc-100">
              {`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${createdToken}`}
            </p>
            <button
              onClick={() => copyLink(createdToken, "new")}
              className="rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors"
            >
              {copiedId === "new"
                ? "Ссылка скопирована"
                : copiedId === "err:new"
                  ? "Ошибка копирования"
                  : "Скопировать ссылку"}
            </button>
            <p className="text-xs text-zinc-400">
              Отправьте эту ссылку сотруднику в WhatsApp или любым удобным способом.
            </p>
          </div>
        )}
      </div>

      {/* ── Список активных приглашений ────────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-800">Активные приглашения</h2>

        {invitations.length === 0 ? (
          <p className="text-sm text-zinc-400">Активных приглашений пока нет.</p>
        ) : (
          <div className="space-y-2">
            {invitations.map((inv) => {
              const isRevoking = revoking === inv.id
              const revokeErr = revokeErrors[inv.id]
              const copyKey = `list:${inv.id}`

              return (
                <div
                  key={inv.id}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Инфо */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-zinc-800">
                        {inv.invited_name || "Без имени"}
                      </p>
                      {(inv.invited_phone || inv.invited_email) && (
                        <p className="text-xs text-zinc-400 truncate">
                          {inv.invited_phone || inv.invited_email}
                        </p>
                      )}
                      <p className="text-xs text-zinc-500">
                        {ROLE_LABELS[inv.role as TeamRole] ?? inv.role}
                      </p>
                      <p className="text-xs text-zinc-400">
                        Истекает {formatExpiry(inv.expires_at)}
                      </p>
                    </div>

                    {/* Кнопки */}
                    <div className="shrink-0 flex flex-col gap-1.5 items-end">
                      <button
                        onClick={() => copyLink(inv.token, copyKey)}
                        className="rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors"
                      >
                        {copiedId === copyKey
                          ? "Скопировано"
                          : copiedId === `err:${copyKey}`
                            ? "Ошибка"
                            : "Скопировать"}
                      </button>
                      <button
                        onClick={() => handleRevoke(inv.id)}
                        disabled={isRevoking}
                        className="rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 text-xs font-medium text-red-600 transition-colors"
                      >
                        {isRevoking ? "..." : "Отозвать"}
                      </button>
                    </div>
                  </div>

                  {revokeErr && (
                    <p className="text-xs text-red-500">{revokeErr}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
