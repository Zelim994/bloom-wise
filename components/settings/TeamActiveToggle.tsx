"use client"

import { useState, useTransition } from "react"
import { toggleTeamMemberActive } from "@/app/actions/team"

type Props = {
  memberId: string
  isActive: boolean
}

export function TeamActiveToggle({ memberId, isActive }: Props) {
  const [localActive, setLocalActive] = useState(isActive)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  const handle = () => {
    setError(null)
    start(async () => {
      const result = await toggleTeamMemberActive(memberId, !localActive)
      if (result.error) {
        setError(result.error)
      } else {
        setLocalActive((prev) => !prev)
      }
    })
  }

  return (
    <div className="space-y-0.5">
      <button
        onClick={handle}
        disabled={isPending}
        className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          localActive
            ? "border-zinc-200 text-zinc-500 hover:border-red-300 hover:text-red-500"
            : "border-zinc-200 text-zinc-500 hover:border-green-300 hover:text-green-600"
        }`}
      >
        {isPending ? "..." : localActive ? "Отключить" : "Включить"}
      </button>
      {error && (
        <p className="text-[10px] text-red-500 text-right max-w-[160px] leading-tight">
          {error}
        </p>
      )}
    </div>
  )
}
