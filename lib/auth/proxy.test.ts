// G2-B2 rollout: настоящий proxy с замоканным @supabase/ssr.
//
// Проверяются фактические редиректы, сохранение обновлённых auth-cookie на
// редиректах и то, что origin редиректа не берётся из X-Forwarded-Host.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

type CookieToSet = { name: string; value: string; options: Record<string, unknown> }
type CookieAdapter = { getAll(): unknown; setAll(cookies: CookieToSet[]): void }

const current = vi.hoisted(() => ({
  user: null as { id: string } | null,
  refreshedCookies: [] as CookieToSet[],
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: CookieAdapter }) => ({
    auth: {
      getUser: async () => {
        // Как настоящий клиент: обновление токена пишет cookie через setAll
        if (current.refreshedCookies.length > 0) options.cookies.setAll(current.refreshedCookies)
        return { data: { user: current.user }, error: null }
      },
    },
  }),
}))

const { proxy } = await import("@/proxy")

const ORIGIN = "http://localhost:3000"
const REFRESHED: CookieToSet = {
  name: "sb-test-auth-token",
  value: "refreshed-session",
  options: { path: "/", httpOnly: true, sameSite: "lax" },
}

async function run(path: string, headers: Record<string, string> = {}) {
  const response = await proxy(new NextRequest(`${ORIGIN}${path}`, { headers }))
  return {
    response,
    location: response.headers.get("location"),
    setCookie: response.headers.get("set-cookie") ?? "",
  }
}

beforeEach(() => {
  current.user = null
  current.refreshedCookies = []
})

describe("authenticated arrival on /login or /register", () => {
  beforeEach(() => {
    current.user = { id: "user-1" }
  })

  it("goes to the safe invitation from next instead of onboarding", async () => {
    const { location } = await run("/login?next=%2Finvite%2Fexample-token")
    expect(location).toBe(`${ORIGIN}/invite/example-token`)
  })

  it("does the same from /register", async () => {
    const { location } = await run("/register?next=%2Finvite%2Fexample-token")
    expect(location).toBe(`${ORIGIN}/invite/example-token`)
  })

  it("keeps the redirect for a bare /login", async () => {
    expect((await run("/login")).location).toBe(`${ORIGIN}/`)
  })

  it.each([
    "https%3A%2F%2Fevil.example",
    "%2F%2Fevil.example",
    "%2F%5Cevil.example",
    "%2F%09%2Fevil.example",
    "%2F%252F%252Fevil.example",
    "%2Flogin",
    "%2F.%2Flogin",
    "%2F%256Cogin",
    "%2Fregister%2F",
    "%2Fauth%2Fcallback%3Fcode%3Dx",
  ])("rejects external or auth-loop next=%s", async (next) => {
    const { location } = await run(`/login?next=${next}`)
    expect(location).toBe(`${ORIGIN}/`)
  })

  it("preserves refreshed auth cookies on the redirect", async () => {
    current.refreshedCookies = [REFRESHED]
    const { response, setCookie } = await run("/login?next=%2Finvite%2Fexample-token")

    expect(response.status).toBe(307)
    expect(setCookie).toContain("sb-test-auth-token=refreshed-session")
    expect(setCookie.toLowerCase()).toContain("httponly")
  })

  it("does not take the redirect origin from X-Forwarded-Host", async () => {
    const { location } = await run("/login?next=%2Finvite%2Fexample-token", {
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    })
    expect(new URL(location!).host).toBe("localhost:3000")
  })

  it("lets an authenticated user through to onboarding with refreshed cookies", async () => {
    current.refreshedCookies = [REFRESHED]
    const { response, location, setCookie } = await run("/onboarding")

    expect(location).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(setCookie).toContain("sb-test-auth-token=refreshed-session")
  })
})

describe("anonymous requests", () => {
  it("redirects a protected path to /login and keeps refreshed (e.g. cleared) cookies", async () => {
    current.refreshedCookies = [{ ...REFRESHED, value: "", options: { path: "/", maxAge: 0 } }]
    const { location, setCookie } = await run("/orders")

    expect(new URL(location!).pathname).toBe("/login")
    expect(setCookie).toContain("sb-test-auth-token=")
  })

  it.each(["/login?next=%2Finvite%2Fx", "/register", "/invite/example-token", "/auth/callback?code=x", "/forgot-password", "/reset-password"])(
    "lets public path %s through",
    async (path) => {
      const { location } = await run(path)
      expect(location).toBeNull()
    }
  )
})
