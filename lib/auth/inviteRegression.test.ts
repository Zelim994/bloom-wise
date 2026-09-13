// CORE-READY-G2-B2: auth callback и приглашения после удаления неявного bootstrap.
//
// Callback теперь только обменивает код и безопасно редиректит; приглашение
// сохраняет свою ссылку и собственный accept-путь; ни один из этих путей —
// включая недействительный или просроченный токен — не создаёт организацию.
// Последний блок фиксирует архитектурный инвариант: в исходниках приложения
// create_my_organization вызывается ровно из одного файла.

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createSupabaseMock, elementStrings, type SupabaseMockOptions } from "./testing/supabaseMock"

const current = vi.hoisted(() => ({ client: null as unknown }))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => current.client,
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const { GET } = await import("@/app/auth/callback/route")
const { acceptTeamInvitation } = await import("@/app/actions/invitations")
const { default: InvitePage } = await import("@/app/invite/[token]/page")

const ORIGIN = "https://app.bloomwise.test"
const USER = { id: "user-1", user_metadata: { salon_name: "Салон" } }

function useSupabase(options: SupabaseMockOptions) {
  const mock = createSupabaseMock(options)
  current.client = mock.client
  return mock
}

async function callback(query: string) {
  const request = new Request(`${ORIGIN}/auth/callback${query}`)
  const response = await GET(request as never)
  return response.headers.get("location")
}

beforeEach(() => {
  current.client = null
})

describe("GET /auth/callback", () => {
  it("exchanges the code and follows next=/onboarding without bootstrapping", async () => {
    const mock = useSupabase({
      user: USER,
      rpc: { create_my_organization: { data: "org-new", error: null } },
    })

    expect(await callback("?code=abc&next=%2Fonboarding")).toBe(`${ORIGIN}/onboarding`)
    expect(mock.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc")
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.queries).toEqual([])
  })

  it("returns an invite signup to the exact invite link", async () => {
    const mock = useSupabase({ user: USER })

    expect(await callback("?code=abc&next=%2Finvite%2Fexample-token")).toBe(
      `${ORIGIN}/invite/example-token`
    )
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("keeps the password recovery destination", async () => {
    const mock = useSupabase({ user: USER })

    expect(await callback("?code=abc&next=%2Freset-password")).toBe(`${ORIGIN}/reset-password`)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["absolute URL", "https%3A%2F%2Fevil.example"],
    ["protocol-relative", "%2F%2Fevil.example"],
    ["TAB bypass", "%2F%09%2Fevil.example"],
  ])("falls back to / for an unsafe next (%s)", async (_label, next) => {
    const mock = useSupabase({ user: USER })

    expect(await callback(`?code=abc&next=${next}`)).toBe(`${ORIGIN}/`)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("falls back to / when next is absent (the dashboard gate handles orgless users)", async () => {
    const mock = useSupabase({ user: USER })

    expect(await callback("?code=abc")).toBe(`${ORIGIN}/`)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("sends a failed exchange to /login?error=auth", async () => {
    const mock = useSupabase({ user: null, exchangeError: { message: "expired" } })

    expect(await callback("?code=bad&next=%2Fonboarding")).toBe(`${ORIGIN}/login?error=auth`)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("sends a request without a code to /login?error=auth without touching Supabase", async () => {
    const mock = useSupabase({ user: USER })

    expect(await callback("?next=%2Finvite%2Fexample-token")).toBe(`${ORIGIN}/login?error=auth`)
    expect(mock.client.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })
})

describe("acceptTeamInvitation (unchanged accept path)", () => {
  it("joins through accept_team_invitation only", async () => {
    const mock = useSupabase({
      user: USER,
      rpc: {
        accept_team_invitation: { data: { ok: true, organization_id: "org-9", role: "florist" }, error: null },
      },
    })

    await expect(acceptTeamInvitation("example-token")).resolves.toEqual({
      success: true,
      data: { organization_id: "org-9", role: "florist" },
    })
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["accept_team_invitation"])
  })

  it("an expired or invalid token fails without falling back to creation", async () => {
    const mock = useSupabase({
      user: USER,
      rpc: {
        accept_team_invitation: { data: { error: "invitation_not_found_or_expired" }, error: null },
      },
    })

    await expect(acceptTeamInvitation("expired-token")).resolves.toEqual({
      error: "Приглашение не найдено или срок действия истёк",
    })
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["accept_team_invitation"])
  })
})

describe("/invite/[token] page", () => {
  const params = (token: string) => Promise.resolve({ token })

  it("renders the not-found state for an invalid token and creates nothing for an orgless user", async () => {
    const mock = useSupabase({
      user: USER,
      profile: { organization_id: null },
      rpc: { get_team_invitation_preview: { data: { error: "invitation_not_found_or_expired" }, error: null } },
    })

    const markup = elementStrings(await InvitePage({ params: params("bad-token") }))
    expect(markup).toContain("Приглашение не найдено")
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["get_team_invitation_preview"])
    expect(mock.writes).toEqual([])
  })

  it("offers login/register with next pointing back to the same invite", async () => {
    useSupabase({
      user: null,
      rpc: {
        get_team_invitation_preview: {
          data: { ok: true, organization_name: "Салон", role: "florist", expires_at: "2030-01-01T00:00:00Z" },
          error: null,
        },
      },
    })

    const markup = elementStrings(await InvitePage({ params: params("example-token") }))
    expect(markup).toContain("/login?next=%2Finvite%2Fexample-token")
    expect(markup).toContain("/register?next=%2Finvite%2Fexample-token")
  })

  it("offers acceptance to an orgless user without creating an organization first", async () => {
    const mock = useSupabase({
      user: USER,
      profile: { organization_id: null },
      rpc: {
        get_team_invitation_preview: {
          data: { ok: true, organization_name: "Салон", role: "florist", expires_at: "2030-01-01T00:00:00Z" },
          error: null,
        },
      },
    })

    const markup = elementStrings(await InvitePage({ params: params("example-token") }))
    expect(markup).toContain("example-token")
    expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["get_team_invitation_preview"])
    expect(mock.writes).toEqual([])
  })
})

describe("single organization bootstrap entry point", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [full] : []
    })
  }

  it("create_my_organization is invoked only by app/onboarding/actions.ts", () => {
    const callers = ["app", "components", "lib"]
      .flatMap((dir) => sourceFiles(path.join(repoRoot, dir)))
      // Сгенерированная схема описывает сигнатуру RPC, но не вызывает её
      .filter((file) => !file.endsWith(path.join("lib", "supabase", "database.generated.ts")))
      .filter((file) => readFileSync(file, "utf8").includes("create_my_organization"))
      .map((file) => path.relative(repoRoot, file))

    expect(callers).toEqual([path.join("app", "onboarding", "actions.ts")])
  })
})
