// G2-B2 rollout: возврат из auth-ссылок и с auth-страниц.
//
// Цели сначала проходят настоящий getSafeNext, затем отсекаются auth-маршруты,
// в том числе замаскированные нормализацией URL (dot-сегменты, percent-encoding,
// регистр, завершающий слэш).

import { describe, expect, it } from "vitest"

import { getSafeNext } from "./next"
import {
  getAuthenticatedAuthRouteRedirect,
  getCallbackFailureRedirect,
  getForgotPasswordErrorMessage,
  getLoginErrorMessage,
  getSafeReturnTarget,
} from "./authReturn"

const BASE = "https://app.bloomwise.test"

const EXTERNAL_OR_UNSAFE: ReadonlyArray<string> = [
  "https://evil.example/invite/x",
  "http://evil.example",
  "//evil.example/invite/x",
  "/\\evil.example",
  "/\t/evil.example",
  "javascript:alert(1)",
  // getSafeNext принимает (тот же origin), но декодируется в "//evil.example"
  "/%2F%2Fevil.example",
  "/%5C%5Cevil.example",
]

const AUTH_LOOPS: ReadonlyArray<string> = [
  "/login",
  "/login/",
  "/login?next=/invite/x",
  "/LOGIN",
  "/./login",
  "/invite/../login",
  "/%6Cogin",
  "/%2E/register",
  "/register",
  "/auth/callback?code=abc",
]

describe("getSafeReturnTarget", () => {
  it("keeps safe internal targets byte-for-byte", () => {
    expect(getSafeReturnTarget("/invite/example-token")).toBe("/invite/example-token")
    expect(getSafeReturnTarget("/onboarding")).toBe("/onboarding")
    expect(getSafeReturnTarget("/orders/new?recipe=abc#items")).toBe("/orders/new?recipe=abc#items")
  })

  it.each(EXTERNAL_OR_UNSAFE)("rejects external or smuggled target %j", (value) => {
    expect(getSafeReturnTarget(value)).toBeNull()
  })

  it.each(AUTH_LOOPS)("rejects auth-loop target %j", (value) => {
    expect(getSafeReturnTarget(value)).toBeNull()
  })

  it("never accepts something getSafeNext rejects", () => {
    for (const value of [...EXTERNAL_OR_UNSAFE, ...AUTH_LOOPS]) {
      if (getSafeNext(value) === null) expect(getSafeReturnTarget(value)).toBeNull()
    }
  })
})

describe("getCallbackFailureRedirect", () => {
  /** Разбирает редирект так, как это сделает страница входа. */
  function loginNext(redirect: string): string | null {
    const url = new URL(redirect, BASE)
    expect(url.pathname).toBe("/login")
    expect(url.searchParams.get("error")).toBe("auth")
    return getSafeNext(url.searchParams.get("next"))
  }

  it("preserves an invitation through login", () => {
    expect(loginNext(getCallbackFailureRedirect("/invite/example-token"))).toBe("/invite/example-token")
  })

  it("preserves onboarding through login", () => {
    expect(loginNext(getCallbackFailureRedirect("/onboarding"))).toBe("/onboarding")
  })

  it("preserves an invite token that needs encoding exactly", () => {
    expect(loginNext(getCallbackFailureRedirect("/invite/Ab-9_x?src=mail"))).toBe("/invite/Ab-9_x?src=mail")
  })

  it("sends a failed recovery link to request a new one", () => {
    expect(getCallbackFailureRedirect("/reset-password")).toBe("/forgot-password?error=recovery_link")
    expect(getCallbackFailureRedirect("/./reset-password")).toBe("/forgot-password?error=recovery_link")
  })

  it("drops a missing next without inventing one", () => {
    expect(getCallbackFailureRedirect(null)).toBe("/login?error=auth")
  })

  it.each([...EXTERNAL_OR_UNSAFE, ...AUTH_LOOPS])("drops unsafe next %j", (value) => {
    expect(getCallbackFailureRedirect(value)).toBe("/login?error=auth")
  })
})

describe("getAuthenticatedAuthRouteRedirect", () => {
  it("sends an authenticated arrival to the invitation, not onboarding", () => {
    expect(getAuthenticatedAuthRouteRedirect("/invite/example-token")).toBe("/invite/example-token")
  })

  it("falls back to / without a usable next", () => {
    expect(getAuthenticatedAuthRouteRedirect(null)).toBe("/")
    for (const value of [...EXTERNAL_OR_UNSAFE, ...AUTH_LOOPS]) {
      expect(getAuthenticatedAuthRouteRedirect(value)).toBe("/")
    }
  })
})

describe("banner messages", () => {
  it("explains failed email links on login without claiming the email is confirmed", () => {
    const message = getLoginErrorMessage("auth")
    expect(message).toMatch(/устарела/)
    expect(message).toMatch(/другом браузере/)
    expect(message).toMatch(/Если вы уже подтвердили email/)
    expect(getLoginErrorMessage(null)).toBeNull()
    expect(getLoginErrorMessage("something-else")).toBeNull()
  })

  it("explains failed recovery links and asks for a new one", () => {
    expect(getForgotPasswordErrorMessage("recovery_link")).toMatch(/Запросите новую ссылку/)
    expect(getForgotPasswordErrorMessage(null)).toBeNull()
    expect(getForgotPasswordErrorMessage("auth")).toBeNull()
  })
})
