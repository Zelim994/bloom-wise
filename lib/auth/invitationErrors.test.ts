import { describe, expect, it, vi } from "vitest"
import { createSupabaseMock } from "./testing/supabaseMock"

const current = vi.hoisted(() => ({ client: null as unknown }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
const actions = await import("@/app/actions/invitations")

const cases = [
  ["create_team_invitation", () => actions.createTeamInvitation({ role: "florist" })],
  ["accept_team_invitation", () => actions.acceptTeamInvitation("test-token")],
  ["revoke_team_invitation", () => actions.revokeTeamInvitation("test-id")],
  ["get_team_invitation_preview", () => actions.getTeamInvitationPreview("test-token")],
] as const

describe("invitation RPC failures", () => {
  it.each(cases)("%s does not expose internal errors or report success", async (name, call) => {
    current.client = createSupabaseMock({
      user: { id: "owner" },
      profile: { id: "owner", role: "owner", organization_id: "salon" },
      rpc: { [name]: { data: null, error: { message: "INTERNAL_INVITATION_DIAGNOSTIC_SENTINEL" } } },
    }).client
    const result = await call()
    expect(result.success).not.toBe(true)
    expect(result.error).toContain("Обновите страницу")
    expect(result.error).not.toContain("INTERNAL_INVITATION_DIAGNOSTIC_SENTINEL")
  })
})
