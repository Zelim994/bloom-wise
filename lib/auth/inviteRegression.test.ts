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

import { getSafeNext } from "./next"
import { createSupabaseMock, elementStrings, type SupabaseMockOptions } from "./testing/supabaseMock"

const current = vi.hoisted(() => ({ client: null as unknown }))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => current.client,
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const { GET } = await import("@/app/auth/callback/route")
const { acceptTeamInvitation } = await import("@/app/actions/invitations")
const { default: InvitePage } = await import("@/app/invite/[token]/page")

// Origin, который видит Next внутри (dev на localhost или upstream за прокси),
// и отличающийся от него публичный origin, открытый в браузере пользователя.
const INTERNAL_ORIGIN = "http://localhost:3100"
const PUBLIC_ORIGIN = "http://127.0.0.1:3100"
const USER = { id: "user-1", user_metadata: { salon_name: "Салон" } }

function useSupabase(options: SupabaseMockOptions) {
  const mock = createSupabaseMock(options)
  current.client = mock.client
  return mock
}

/** Возвращает сырой Location — ровно то, что получит браузер. */
async function callback(query: string, headers: Record<string, string> = {}) {
  const request = new Request(`${INTERNAL_ORIGIN}/auth/callback${query}`, { headers })
  const response = await GET(request as never)
  expect(response.status).toBe(307)
  return response.headers.get("location")
}

/** Как браузер разрешит Location от URL, который открыл он сам. */
function resolvedByBrowser(location: string | null): URL {
  return new URL(location!, `${PUBLIC_ORIGIN}/auth/callback?code=x`)
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

    expect(await callback("?code=abc&next=%2Fonboarding")).toBe(`/onboarding`)
    expect(mock.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc")
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.queries).toEqual([])
  })

  it("returns an invite signup to the exact invite link", async () => {
    const mock = useSupabase({ user: USER })

    expect(await callback("?code=abc&next=%2Finvite%2Fexample-token")).toBe(
      `/invite/example-token`
    )
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("keeps the password recovery destination", async () => {
    const mock = useSupabase({ user: USER })

    expect(await callback("?code=abc&next=%2Freset-password")).toBe(`/reset-password`)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["absolute URL", "https%3A%2F%2Fevil.example"],
    ["protocol-relative", "%2F%2Fevil.example"],
    ["TAB bypass", "%2F%09%2Fevil.example"],
  ])("falls back to / for an unsafe next (%s)", async (_label, next) => {
    const mock = useSupabase({ user: USER })

    expect(await callback(`?code=abc&next=${next}`)).toBe(`/`)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("falls back to / when next is absent (the dashboard gate handles orgless users)", async () => {
    const mock = useSupabase({ user: USER })

    expect(await callback("?code=abc")).toBe(`/`)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("a failed exchange (expired, reused or other-browser code) keeps onboarding through login", async () => {
    const mock = useSupabase({ user: null, exchangeError: { message: "invalid flow state" } })

    expect(await callback("?code=bad&next=%2Fonboarding")).toBe(
      `/login?error=auth&next=%2Fonboarding`
    )
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("a failed exchange keeps the invitation through login", async () => {
    const mock = useSupabase({ user: null, exchangeError: { message: "code verifier missing" } })

    expect(await callback("?code=reused&next=%2Finvite%2Fexample-token")).toBe(
      `/login?error=auth&next=%2Finvite%2Fexample-token`
    )
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("an expired link without a code (Supabase error params) keeps the invitation, no exchange", async () => {
    const mock = useSupabase({ user: USER })

    expect(
      await callback("?error=access_denied&error_code=otp_expired&next=%2Finvite%2Fexample-token")
    ).toBe(`/login?error=auth&next=%2Finvite%2Fexample-token`)
    expect(mock.client.auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("a failed recovery link goes to request a new one, not to reset-password", async () => {
    const mock = useSupabase({ user: null, exchangeError: { message: "expired" } })

    expect(await callback("?code=old&next=/reset-password")).toBe(
      `/forgot-password?error=recovery_link`
    )
    expect(await callback("?error=access_denied&next=%2Freset-password")).toBe(
      `/forgot-password?error=recovery_link`
    )
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["absolute URL", "https%3A%2F%2Fevil.example"],
    ["protocol-relative", "%2F%2Fevil.example"],
    ["encoded double slash", "%2F%252F%252Fevil.example"],
    ["auth loop", "%2Flogin"],
    ["callback loop", "%2Fauth%2Fcallback"],
  ])("a failed link never forwards an unsafe next (%s)", async (_label, next) => {
    useSupabase({ user: null, exchangeError: { message: "expired" } })

    expect(await callback(`?code=bad&next=${next}`)).toBe(`/login?error=auth`)
    expect(await callback(`?next=${next}`)).toBe(`/login?error=auth`)
  })

  it.each([
    ["success", { user: USER }, "?code=abc&next=%2Freset-password", "/reset-password"],
    ["failure", { user: null, exchangeError: { message: "expired" } }, "?code=old&next=%2Finvite%2Ft", "/login"],
  ] as const)(
    "%s keeps the browser's public host when Next sees an internal origin",
    async (_label, options, query, pathname) => {
      useSupabase(options)

      const location = await callback(query, {
        host: "localhost:3100",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      })

      // Относительный путь: ни внутреннего, ни пересланного хоста в Location нет
      expect(location).toMatch(/^\/(?![/\\])/)
      expect(location).not.toContain("localhost")
      expect(location).not.toContain("evil.example")
      const url = resolvedByBrowser(location)
      expect(url.origin).toBe(PUBLIC_ORIGIN)
      expect(url.pathname).toBe(pathname)
    }
  )

  it.each([
    "https%3A%2F%2Fevil.example",
    "%2F%2Fevil.example",
    "%2F%5Cevil.example",
    "%5C%5Cevil.example",
    "%2F%09%2Fevil.example",
    "%2F%0D%0ALocation%3A%20https%3A%2F%2Fevil.example",
    "javascript%3Aalert(1)",
    "%2F%252F%252Fevil.example",
    // getSafeNext принимает (тот же origin), но канонизация даёт "//evil.example"
    encodeURIComponent("/safe/..//evil.example"),
    encodeURIComponent("/safe/..\\/evil.example"),
    encodeURIComponent("/a/b/../..//evil.example/path?x=1"),
  ])("a hostile next=%s never yields an off-origin Location (success or failure)", async (next) => {
    for (const options of [{ user: USER }, { user: null, exchangeError: { message: "expired" } }]) {
      current.client = createSupabaseMock(options).client
      for (const query of [`?code=abc&next=${next}`, `?next=${next}`]) {
        const location = await callback(query)
        expect(location).toMatch(/^\/(?![/\\])/)
        expect(location).not.toMatch(/[\r\n]/)
        expect(resolvedByBrowser(location).origin).toBe(PUBLIC_ORIGIN)
      }
    }
  })

  it("never emits a network-path Location for a dot-segment target that collapses to //host", async () => {
    // Регрессия сериализации: до канонизации значение внутреннее, после — "//evil.example"
    expect(getSafeNext("/safe/..//evil.example")).toBe("/safe/..//evil.example")

    useSupabase({ user: USER })
    const success = await callback(`?code=abc&next=${encodeURIComponent("/safe/..//evil.example")}`)
    expect(success).toBe("/")

    useSupabase({ user: null, exchangeError: { message: "expired" } })
    const failure = await callback(`?code=bad&next=${encodeURIComponent("/safe/..//evil.example")}`)
    expect(failure).toBe("/login?error=auth")

    for (const location of [success, failure]) {
      expect(resolvedByBrowser(location).origin).toBe(PUBLIC_ORIGIN)
    }
  })

  it("serializes a safe Unicode query into an ASCII Location instead of throwing", async () => {
    useSupabase({ user: USER })

    const location = await callback(`?code=abc&next=${encodeURIComponent("/onboarding?name=Салон")}`)
    expect(location).toBe("/onboarding?name=%D0%A1%D0%B0%D0%BB%D0%BE%D0%BD")
    expect(() => new Headers({ Location: location! })).not.toThrow()

    const url = resolvedByBrowser(location)
    expect(url.origin).toBe(PUBLIC_ORIGIN)
    expect(url.pathname).toBe("/onboarding")
    expect(url.searchParams.get("name")).toBe("Салон")
  })

  it("serializes a Unicode invite path and hash, keeping them internal", async () => {
    useSupabase({ user: USER })

    const location = await callback(`?code=abc&next=${encodeURIComponent("/invite/токен#Приглашение")}`)
    expect(location).toBe(
      "/invite/%D1%82%D0%BE%D0%BA%D0%B5%D0%BD#%D0%9F%D1%80%D0%B8%D0%B3%D0%BB%D0%B0%D1%88%D0%B5%D0%BD%D0%B8%D0%B5"
    )
    expect(decodeURIComponent(resolvedByBrowser(location).pathname)).toBe("/invite/токен")
  })

  it("keeps an already percent-encoded invitation byte-for-byte (no double encoding)", async () => {
    useSupabase({ user: USER })

    const target = "/invite/Ab%2Fc%20d?src=mail%26x"
    expect(await callback(`?code=abc&next=${encodeURIComponent(target)}`)).toBe(target)
  })

  it("canonicalizes internal dot segments", async () => {
    useSupabase({ user: USER })

    expect(await callback(`?code=abc&next=${encodeURIComponent("/invite/../onboarding")}`)).toBe("/onboarding")
  })

  it("a failed Unicode invite link still returns through login with a safe ASCII next", async () => {
    useSupabase({ user: null, exchangeError: { message: "expired" } })

    const location = await callback(`?code=bad&next=${encodeURIComponent("/invite/токен?name=Салон")}`)
    expect(location).toMatch(/^\/login\?error=auth&next=/)
    expect(() => new Headers({ Location: location! })).not.toThrow()

    const url = resolvedByBrowser(location)
    expect(url.origin).toBe(PUBLIC_ORIGIN)
    expect(getSafeNext(url.searchParams.get("next"))).toBe("/invite/токен?name=Салон")
  })

  it("a request without code or next goes to /login?error=auth without touching Supabase", async () => {
    const mock = useSupabase({ user: USER })

    expect(await callback("")).toBe(`/login?error=auth`)
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
