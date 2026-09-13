// CORE-READY-G2-B2: куда попадает пользователь после login/register/confirmation.
//
// Регистрация с подтверждением email и без него должна сходиться в одной
// точке: обычная — /onboarding, по приглашению — та же /invite/<token>.
// Значения safeNext подаются через настоящий getSafeNext, как на страницах.

import { describe, expect, it } from "vitest"

import { getSafeNext } from "./next"
import {
  getPostLoginDestination,
  getPostSignupDestination,
  getSignupEmailRedirectTo,
  normalizeOrganizationName,
  ORGANIZATION_NAME_MAX_LENGTH,
} from "./onboarding"

const ORIGIN = "https://app.bloomwise.test"
const INVITE = "/invite/example-token"

/** Разбирает emailRedirectTo так же, как его потом разберёт /auth/callback. */
function callbackNext(emailRedirectTo: string): string | null {
  const url = new URL(emailRedirectTo)
  expect(url.origin).toBe(ORIGIN)
  expect(url.pathname).toBe("/auth/callback")
  return getSafeNext(url.searchParams.get("next"))
}

describe("standalone registration", () => {
  it("confirmation ON: email link returns through the callback to /onboarding", () => {
    expect(callbackNext(getSignupEmailRedirectTo(ORIGIN, getSafeNext(null)))).toBe("/onboarding")
  })

  it("confirmation OFF: immediate session goes to /onboarding", () => {
    expect(getPostSignupDestination(getSafeNext(null))).toBe("/onboarding")
  })

  it("ON and OFF converge on the same destination", () => {
    const safeNext = getSafeNext(null)
    expect(callbackNext(getSignupEmailRedirectTo(ORIGIN, safeNext))).toBe(
      getPostSignupDestination(safeNext)
    )
  })

  it("a non-invite next does not bypass onboarding for a brand-new owner", () => {
    const safeNext = getSafeNext("/orders/new")
    expect(getPostSignupDestination(safeNext)).toBe("/onboarding")
    expect(callbackNext(getSignupEmailRedirectTo(ORIGIN, safeNext))).toBe("/onboarding")
  })

  it("an unsafe next is discarded and still lands on /onboarding", () => {
    const safeNext = getSafeNext("//evil.example/invite/x")
    expect(safeNext).toBeNull()
    expect(getPostSignupDestination(safeNext)).toBe("/onboarding")
  })
})

describe("invite registration keeps its token", () => {
  it("confirmation ON: email link returns to the same invite", () => {
    expect(callbackNext(getSignupEmailRedirectTo(ORIGIN, getSafeNext(INVITE)))).toBe(INVITE)
  })

  it("confirmation OFF: immediate session returns to the same invite", () => {
    expect(getPostSignupDestination(getSafeNext(INVITE))).toBe(INVITE)
  })

  it("the invite link survives percent-encoding round-trip byte-for-byte", () => {
    const token = "/invite/Ab-9_x"
    expect(callbackNext(getSignupEmailRedirectTo(ORIGIN, getSafeNext(token)))).toBe(token)
  })
})

describe("login destination", () => {
  it("returns the safe next unchanged, including an invite", () => {
    expect(getPostLoginDestination(getSafeNext(INVITE))).toBe(INVITE)
    expect(getPostLoginDestination(getSafeNext("/orders"))).toBe("/orders")
  })

  it("falls back to / (the dashboard gate decides about onboarding)", () => {
    expect(getPostLoginDestination(getSafeNext(null))).toBe("/")
    expect(getPostLoginDestination(getSafeNext("https://evil.example"))).toBe("/")
  })
})

describe("normalizeOrganizationName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeOrganizationName("  Цветочный рай  ")).toEqual({ ok: true, name: "Цветочный рай" })
  })

  it("rejects missing, non-string and whitespace-only input", () => {
    expect(normalizeOrganizationName(null).ok).toBe(false)
    expect(normalizeOrganizationName(new File([], "x")).ok).toBe(false)
    expect(normalizeOrganizationName("   \t ").ok).toBe(false)
  })

  it("accepts the maximum length and rejects one character more", () => {
    const max = "а".repeat(ORGANIZATION_NAME_MAX_LENGTH)
    expect(normalizeOrganizationName(max)).toEqual({ ok: true, name: max })
    expect(normalizeOrganizationName(`${max}а`).ok).toBe(false)
  })
})
