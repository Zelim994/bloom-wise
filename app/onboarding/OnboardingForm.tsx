"use client"

import { useActionState } from "react"
import { createOrganization, type OnboardingActionState } from "./actions"
import { ORGANIZATION_NAME_MAX_LENGTH } from "@/lib/auth/onboarding"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: OnboardingActionState = { error: null }

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(createOrganization, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="organizationName" className="text-sm font-medium text-zinc-700">
          Название салона
        </Label>
        <Input
          id="organizationName"
          name="organizationName"
          placeholder="Цветочный рай"
          defaultValue={defaultName}
          required
          maxLength={ORGANIZATION_NAME_MAX_LENGTH}
          className="h-10 border-zinc-200"
        />
      </div>

      {state.error && (
        <p aria-live="polite" className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="w-full h-10 bg-rose-500 hover:bg-rose-600 text-white font-medium"
      >
        {pending ? "Создаём салон..." : "Создать салон"}
      </Button>
    </form>
  )
}
