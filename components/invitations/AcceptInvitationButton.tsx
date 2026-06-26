"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { acceptTeamInvitation } from "@/app/actions/invitations"

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAccept() {
    setError(null)
    startTransition(async () => {
      const result = await acceptTeamInvitation(token)
      if (result.error) {
        setError(result.error)
      } else {
        router.push("/")
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleAccept}
        disabled={isPending}
        className="w-full rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-white transition-colors"
      >
        {isPending ? "Принимаем..." : "Принять приглашение"}
      </button>
      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 text-center">
          {error}
        </p>
      )}
    </div>
  )
}
