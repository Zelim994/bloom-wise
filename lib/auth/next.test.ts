// Regression suite for the `next=` redirect guard.
//
// getSafeNext is the only barrier between an attacker-controlled `next` query
// parameter and a navigation: app/(auth)/login and /register feed its result
// straight into router.push(), and app/auth/callback concatenates it onto the
// origin. These tests lock the accept/reject decisions the guard makes today.
//
// Pure string logic: no DB, no env, no network, no mocks.

import { describe, expect, it } from "vitest"

import { getSafeNext } from "./next"

describe("getSafeNext — accepted internal paths", () => {
  it("returns a plain internal route unchanged", () => {
    expect(getSafeNext("/invite/example-token")).toBe("/invite/example-token")
    expect(getSafeNext("/")).toBe("/")
  })

  it("preserves query strings and hashes verbatim", () => {
    // The guard is not a sanitizer — anything starting with a single "/" is
    // passed through as-is, query and fragment included.
    expect(getSafeNext("/orders/new?recipe=abc")).toBe("/orders/new?recipe=abc")
    expect(getSafeNext("/orders/123#items")).toBe("/orders/123#items")
  })
})

describe("getSafeNext — rejected external destinations", () => {
  it("rejects absolute https and http URLs", () => {
    expect(getSafeNext("https://evil.example/path")).toBeNull()
    expect(getSafeNext("http://evil.example/path")).toBeNull()
  })

  it("rejects protocol-relative URLs", () => {
    // "//evil.example" resolves to a different origin, so it must never be
    // handed to router.push().
    expect(getSafeNext("//evil.example/path")).toBeNull()
    expect(getSafeNext("//evil.example")).toBeNull()
  })

  it("rejects backslash variants of the protocol-relative bypass", () => {
    // URL parsers treat "\" as "/" in the authority position, so "/\evil" is
    // equivalent to "//evil".
    expect(getSafeNext("/\\evil.example")).toBeNull()
    expect(getSafeNext("/\\/evil.example")).toBeNull()
    expect(getSafeNext("\\\\evil.example")).toBeNull()
  })

  it("rejects non-path schemes", () => {
    // Rejected by the leading-"/" requirement rather than a scheme allowlist.
    expect(getSafeNext("javascript:alert(1)")).toBeNull()
    expect(getSafeNext("data:text/html,<script>")).toBeNull()
  })

  it("rejects values that do not begin with a slash", () => {
    expect(getSafeNext("evil.example")).toBeNull()
    expect(getSafeNext("orders/new")).toBeNull()
    // Leading whitespace shifts the "/" off position 0, so this is rejected too.
    expect(getSafeNext(" /orders/new")).toBeNull()
  })
})

describe("getSafeNext — absent input", () => {
  it("falls back to null for null, undefined and empty string", () => {
    // The function itself returns null; call sites choose the landing route
    // (`?? "/"` in app/auth/callback, `|| "/"` in the auth pages).
    expect(getSafeNext(null)).toBeNull()
    expect(getSafeNext(undefined)).toBeNull()
    expect(getSafeNext("")).toBeNull()
  })
})
