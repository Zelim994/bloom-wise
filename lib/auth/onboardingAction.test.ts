// CORE-READY-G2-B2: createOrganization — единственная точка создания организации.
//
// Вызывается настоящий server action. Проверяется, что RPC срабатывает только
// после серверной перепроверки пользователя и профиля, получает только
// нормализованное название и что повтор безопасен.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { createSupabaseMock, RedirectSignal, type SupabaseMockOptions } from "./testing/supabaseMock"

const current = vi.hoisted(() => ({
  client: null as unknown,
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => current.client,
}))

vi.mock("next/cache", () => ({
  revalidatePath: current.revalidatePath,
}))

vi.mock("next/navigation", async () => {
  const { RedirectSignal } = await import("./testing/supabaseMock")
  return {
    redirect: (destination: string) => {
      throw new RedirectSignal(destination)
    },
  }
})

const { createOrganization } = await import("@/app/onboarding/actions")

const USER = { id: "user-1" }
const ORGLESS = { organization_id: null, is_active: true }

function useSupabase(options: SupabaseMockOptions) {
  const mock = createSupabaseMock(options)
  current.client = mock.client
  return mock
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

type Outcome = { redirect: string } | { state: Awaited<ReturnType<typeof createOrganization>> }

async function submit(fields: Record<string, string>): Promise<Outcome> {
  try {
    return { state: await createOrganization({ error: null }, form(fields)) }
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirect: error.destination }
    throw error
  }
}

beforeEach(() => {
  current.client = null
  current.revalidatePath.mockReset()
})

describe("createOrganization — success", () => {
  it("calls the hardened RPC once with the trimmed name, then revalidates and redirects", async () => {
    const mock = useSupabase({
      user: USER,
      profile: ORGLESS,
      rpc: { create_my_organization: { data: "org-1", error: null } },
    })

    expect(await submit({ organizationName: "  Цветочный рай  " })).toEqual({ redirect: "/" })
    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(mock.rpc).toHaveBeenCalledWith("create_my_organization", { p_org_name: "Цветочный рай" })
    expect(current.revalidatePath).toHaveBeenCalledWith("/", "layout")
    // Профиль читается по серверному user.id, а не по данным формы
    expect(mock.queries[0]).toEqual({
      table: "profiles",
      select: "organization_id, is_active",
      filters: [["id", "user-1"]],
    })
    expect(mock.writes).toEqual([])
  })

  it("ignores client-supplied ownership fields entirely", async () => {
    const mock = useSupabase({
      user: USER,
      profile: ORGLESS,
      rpc: { create_my_organization: { data: "org-1", error: null } },
    })

    await submit({
      organizationName: "Салон",
      organization_id: "someone-elses-org",
      user_id: "someone-else",
      role: "owner",
    })

    expect(mock.rpc).toHaveBeenCalledWith("create_my_organization", { p_org_name: "Салон" })
    expect(mock.queries[0].filters).toEqual([["id", "user-1"]])
  })
})

describe("createOrganization — refused before the RPC", () => {
  it("rejects an empty or whitespace-only name", async () => {
    const mock = useSupabase({ user: USER, profile: ORGLESS })

    const outcome = await submit({ organizationName: "   " })
    expect(outcome).toEqual({ state: { error: "Укажите название салона" } })
    expect(mock.rpc).not.toHaveBeenCalled()
    // Невалидный ввод отсекается до любого обращения к Supabase
    expect(mock.client.auth.getUser).not.toHaveBeenCalled()
  })

  it("rejects a missing form field", async () => {
    const mock = useSupabase({ user: USER, profile: ORGLESS })

    expect(await submit({})).toEqual({ state: { error: "Укажите название салона" } })
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("rejects an anonymous caller", async () => {
    const mock = useSupabase({ user: null })

    expect(await submit({ organizationName: "Салон" })).toEqual({
      state: { error: "Нужно войти в систему" },
    })
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("fails clearly on a missing profile and never creates", async () => {
    const mock = useSupabase({ user: USER, profile: null })

    expect(await submit({ organizationName: "Салон" })).toEqual({
      state: { error: "Профиль пользователя не найден" },
    })
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("does not mistake a profile read error for a missing organization", async () => {
    const mock = useSupabase({ user: USER, profileError: { message: "timeout" } })

    const outcome = await submit({ organizationName: "Салон" })
    expect("state" in outcome && outcome.state.error).toMatch(/Не удалось загрузить профиль/)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("sends an inactive user to /deactivated", async () => {
    const mock = useSupabase({ user: USER, profile: { organization_id: null, is_active: false } })

    expect(await submit({ organizationName: "Салон" })).toEqual({ redirect: "/deactivated" })
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("redirects a user who already has an organization without calling the RPC", async () => {
    const mock = useSupabase({ user: USER, profile: { organization_id: "org-1", is_active: true } })

    expect(await submit({ organizationName: "Другой салон" })).toEqual({ redirect: "/" })
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})

describe("createOrganization — RPC failures and retries", () => {
  it("maps the database missing-profile exception and stays on the page", async () => {
    const mock = useSupabase({
      user: USER,
      profile: ORGLESS,
      rpc: { create_my_organization: { data: null, error: { message: "Профиль пользователя не найден" } } },
    })

    expect(await submit({ organizationName: "Салон" })).toEqual({
      state: { error: "Профиль пользователя не найден" },
    })
    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(current.revalidatePath).not.toHaveBeenCalled()
  })

  it("hides unexpected database messages behind a retryable error", async () => {
    useSupabase({
      user: USER,
      profile: ORGLESS,
      rpc: { create_my_organization: { data: null, error: { message: "permission denied for table x" } } },
    })

    const outcome = await submit({ organizationName: "Салон" })
    expect(outcome).toEqual({ state: { error: "Не удалось создать салон. Попробуйте ещё раз." } })
    expect(JSON.stringify(outcome)).not.toContain("permission denied")
  })

  it("treats an empty RPC result as a failure, not a success", async () => {
    useSupabase({
      user: USER,
      profile: ORGLESS,
      rpc: { create_my_organization: { data: null, error: null } },
    })

    expect(await submit({ organizationName: "Салон" })).toEqual({
      state: { error: "Не удалось создать салон. Попробуйте ещё раз." },
    })
    expect(current.revalidatePath).not.toHaveBeenCalled()
  })

  it("a concurrent second submission that still sees NULL relies on the idempotent RPC", async () => {
    // Вторая вкладка прочитала профиль до коммита первой: RPC (FOR UPDATE,
    // migration_037) вернёт тот же id, действие просто завершается редиректом.
    const first = useSupabase({
      user: USER,
      profile: ORGLESS,
      rpc: { create_my_organization: { data: "org-1", error: null } },
    })
    expect(await submit({ organizationName: "Салон" })).toEqual({ redirect: "/" })

    const second = useSupabase({
      user: USER,
      profile: ORGLESS,
      rpc: { create_my_organization: { data: "org-1", error: null } },
    })
    expect(await submit({ organizationName: "Салон" })).toEqual({ redirect: "/" })

    expect(first.rpc).toHaveBeenCalledTimes(1)
    expect(second.rpc).toHaveBeenCalledTimes(1)
  })
})
