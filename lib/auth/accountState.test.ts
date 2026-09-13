// CORE-READY-G2-B2: гейты DashboardLayout и /onboarding.
//
// Настоящие server components вызываются с замоканными Supabase и
// next/navigation: проверяется фактический редирект, отсутствие RPC и то, что
// пара гейтов не образует цикл ни для одного состояния аккаунта.

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createSupabaseMock,
  elementStrings,
  RedirectSignal,
  type SupabaseMockOptions,
} from "./testing/supabaseMock"
import {
  getAccountState,
  getDashboardRedirect,
  getOnboardingRedirect,
  type AccountState,
} from "./accountState"

const current = vi.hoisted(() => ({ client: null as unknown }))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => current.client,
}))

vi.mock("next/navigation", async () => {
  const { RedirectSignal } = await import("./testing/supabaseMock")
  return {
    redirect: (destination: string) => {
      throw new RedirectSignal(destination)
    },
  }
})

// Клиентская оболочка дашборда не нужна для проверки гейта
vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: () => null,
}))

const { default: DashboardLayout } = await import("@/app/(dashboard)/layout")
const { default: OnboardingPage } = await import("@/app/onboarding/page")

const USER = { id: "user-1", user_metadata: { salon_name: "  Цветочный рай  " } }

function profile(overrides: Record<string, unknown> = {}) {
  return { id: "user-1", organization_id: null, is_active: true, role: "florist", ...overrides }
}

function useSupabase(options: SupabaseMockOptions) {
  const mock = createSupabaseMock(options)
  current.client = mock.client
  return mock
}

/** Выполняет server component и возвращает адрес редиректа или null. */
async function redirectOf(render: () => Promise<unknown>): Promise<string | null> {
  try {
    await render()
    return null
  } catch (error) {
    if (error instanceof RedirectSignal) return error.destination
    throw error
  }
}

beforeEach(() => {
  current.client = null
})

describe("getAccountState", () => {
  it("classifies every profile shape without writing", async () => {
    const cases: Array<[SupabaseMockOptions, AccountState["status"]]> = [
      [{ user: null }, "unauthenticated"],
      [{ user: USER, profileError: { message: "boom" } }, "profile_error"],
      [{ user: USER, profile: null }, "profile_missing"],
      [{ user: USER, profile: profile({ is_active: false, organization_id: "org-1" }) }, "inactive"],
      [{ user: USER, profile: profile({ is_active: false }) }, "inactive"],
      [{ user: USER, profile: profile() }, "orgless"],
      [{ user: USER, profile: profile({ organization_id: "org-1" }) }, "member"],
    ]

    for (const [options, status] of cases) {
      const mock = createSupabaseMock(options)
      const state = await getAccountState(mock.client as never)
      expect(state.status).toBe(status)
      expect(mock.rpc).not.toHaveBeenCalled()
      expect(mock.writes).toEqual([])
    }
  })
})

describe("gate pair never loops", () => {
  const states: AccountState[] = [
    { status: "unauthenticated" },
    { status: "profile_error" },
    { status: "profile_missing" },
    { status: "inactive", profile: profile() as never },
    { status: "orgless", profile: profile() as never },
    { status: "member", profile: profile({ organization_id: "org-1" }) as never, organizationId: "org-1" },
  ]

  it.each(states.map((s) => [s.status, s] as const))(
    "%s: dashboard → onboarding → dashboard cannot bounce",
    (_label, state) => {
      const fromDashboard = getDashboardRedirect(state)
      const fromOnboarding = getOnboardingRedirect(state)
      // Если дашборд шлёт на онбординг, онбординг обязан остаться на месте
      if (fromDashboard === "/onboarding") expect(fromOnboarding).toBeNull()
      // Если онбординг шлёт в дашборд, дашборд обязан рендериться
      if (fromOnboarding === "/") expect(fromDashboard).toBeNull()
    }
  )
})

describe("DashboardLayout", () => {
  it("redirects an orgless user to /onboarding without creating an organization", async () => {
    const mock = useSupabase({
      user: USER,
      profile: profile(),
      rpc: { create_my_organization: { data: "org-new", error: null } },
    })

    expect(await redirectOf(() => DashboardLayout({ children: null }))).toBe("/onboarding")
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.writes).toEqual([])
  })

  it("sends an inactive user to /deactivated even when they have an organization", async () => {
    const mock = useSupabase({ user: USER, profile: profile({ is_active: false, organization_id: "org-1" }) })

    expect(await redirectOf(() => DashboardLayout({ children: null }))).toBe("/deactivated")
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("sends a missing profile to the onboarding failure screen, never to creation", async () => {
    const mock = useSupabase({ user: USER, profile: null })

    expect(await redirectOf(() => DashboardLayout({ children: null }))).toBe("/onboarding")
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.writes).toEqual([])
  })

  it("sends an anonymous request to /login", async () => {
    useSupabase({ user: null })
    expect(await redirectOf(() => DashboardLayout({ children: null }))).toBe("/login")
  })

  it("fails loudly on a profile read error instead of treating it as orgless", async () => {
    const mock = useSupabase({ user: USER, profileError: { message: "timeout" } })

    await expect(DashboardLayout({ children: null })).rejects.toThrow(
      "Не удалось загрузить профиль пользователя"
    )
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("renders the shell for a member and reads only its own organization", async () => {
    const mock = useSupabase({
      user: USER,
      profile: profile({ organization_id: "org-1" }),
      organization: { name: "Салон", settings: {} },
    })

    expect(await redirectOf(() => DashboardLayout({ children: null }))).toBeNull()
    expect(mock.queries.map((q) => q.table)).toEqual(["profiles", "organizations"])
    expect(mock.queries[1].filters).toEqual([["id", "org-1"]])
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})

describe("OnboardingPage", () => {
  it("redirects a member with an existing organization to the dashboard", async () => {
    const mock = useSupabase({ user: USER, profile: profile({ organization_id: "org-1" }) })

    expect(await redirectOf(() => OnboardingPage())).toBe("/")
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("redirects an inactive user to /deactivated", async () => {
    useSupabase({ user: USER, profile: profile({ is_active: false }) })
    expect(await redirectOf(() => OnboardingPage())).toBe("/deactivated")
  })

  it("redirects an anonymous request to /login", async () => {
    useSupabase({ user: null })
    expect(await redirectOf(() => OnboardingPage())).toBe("/login")
  })

  it("renders the form for an orgless user but does not create anything on render", async () => {
    const mock = useSupabase({
      user: USER,
      profile: profile(),
      rpc: { create_my_organization: { data: "org-new", error: null } },
    })

    const element = await OnboardingPage()
    // Название из метаданных — только обрезанная подсказка в поле формы
    expect(elementStrings(element).split("\n")).toContain("Цветочный рай")
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.writes).toEqual([])
  })

  it("renders a clear failure without the form when the profile is missing", async () => {
    const mock = useSupabase({ user: USER, profile: null })

    const markup = elementStrings(await OnboardingPage())
    expect(markup).toContain("Профиль пользователя не найден")
    expect(markup).not.toContain("не создавайте новый")
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})
