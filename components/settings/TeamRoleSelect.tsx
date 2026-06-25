"use client"

import { useState, useTransition } from "react"
import { updateTeamMemberRole } from "@/app/actions/team"
import { ALL_ROLE_LABELS, ROLE_LABELS, TEAM_ROLES, type TeamRole } from "@/lib/team/roles"

type TeamRoleSelectProps = {
  memberId: string
  currentRole: string
  currentUserRole: string
  ownerCount: number
}

function getDisabledReason(
  currentRole: string,
  currentUserRole: string,
  ownerCount: number
): string | null {
  if (currentUserRole === "owner" && currentRole === "owner" && ownerCount <= 1) {
    return "Нельзя изменить роль последнего владельца"
  }
  if (currentUserRole === "admin" && currentRole === "owner") {
    return "Только владелец может изменить эту роль"
  }
  if (currentUserRole === "admin" && currentRole === "admin") {
    return "Администратор не может менять роль администратора"
  }
  return null
}

function getAvailableRoles(currentUserRole: string): readonly TeamRole[] {
  if (currentUserRole === "owner") return TEAM_ROLES
  // admin: только florist/cashier/viewer
  return TEAM_ROLES.filter((r) => r !== "admin")
}

function getInitialSelected(currentRole: string): TeamRole {
  if (TEAM_ROLES.includes(currentRole as TeamRole)) {
    return currentRole as TeamRole
  }
  return "florist"
}

const inputCn =
  "rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200 transition-colors"

export function TeamRoleSelect({
  memberId,
  currentRole,
  currentUserRole,
  ownerCount,
}: TeamRoleSelectProps) {
  const [selectedRole, setSelectedRole] = useState<TeamRole>(
    getInitialSelected(currentRole)
  )
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const disabledReason = getDisabledReason(currentRole, currentUserRole, ownerCount)
  const availableRoles = getAvailableRoles(currentUserRole)

  if (disabledReason) {
    return (
      <div className="text-right space-y-0.5">
        <p className="text-xs font-medium text-zinc-600">
          {ALL_ROLE_LABELS[currentRole] ?? currentRole}
        </p>
        <p className="text-[10px] text-zinc-400 max-w-[160px] text-right leading-tight">
          {disabledReason}
        </p>
      </div>
    )
  }

  const handleSave = () => {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await updateTeamMemberRole(memberId, selectedRole)
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
      }
    })
  }

  return (
    <div className="shrink-0 text-right space-y-1.5">
      <div className="flex items-center gap-1.5 justify-end">
        <select
          value={selectedRole}
          onChange={(e) => {
            setSelectedRole(e.target.value as TeamRole)
            setError(null)
            setSuccess(false)
          }}
          disabled={isPending}
          className={`${inputCn} ${isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {availableRoles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={isPending || selectedRole === currentRole}
          className="rounded-lg bg-rose-500 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? "..." : "Сохранить"}
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-red-500 text-right max-w-[200px] leading-tight">
          {error}
        </p>
      )}
      {success && (
        <p className="text-[10px] text-green-600 text-right">Роль обновлена</p>
      )}
    </div>
  )
}
