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
    // The guard validates but never rewrites: an accepted value comes back
    // byte-for-byte, query and fragment included.
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

describe("getSafeNext — URL-parser normalization bypasses", () => {
  // Regression for the gap found in TESTING-CI-B3. URL parsers strip TAB, LF
  // and CR *before* parsing the authority, so each of these decodes to the
  // protocol-relative "//evil.example" and escapes the origin — while a
  // raw-prefix check sees a harmless-looking "/..." string.
  const NORMALIZATION_BYPASSES: ReadonlyArray<readonly [string, string]> = [
    ["TAB", "/\t/evil.example"],
    ["LF", "/\n/evil.example"],
    ["CR", "/\r/evil.example"],
  ]

  it.each(NORMALIZATION_BYPASSES)(
    "rejects a %s smuggled into the authority position",
    (_label, payload) => {
      expect(getSafeNext(payload)).toBeNull()
    }
  )

  it("rejects the same payloads as they actually arrive from the query string", () => {
    // Delivery path proof: searchParams percent-decodes, so ?next=/%09/... is
    // handed to the guard already containing a real control character.
    const encoded = ["%09", "%0A", "%0D"]

    for (const seq of encoded) {
      const decoded = new URLSearchParams(
        `next=/${seq}/evil.example`
      ).get("next")

      // The decoded value is what the guard really sees at runtime.
      expect(decoded).not.toBeNull()
      expect(decoded).toMatch(/^\/[\t\n\r]\/evil\.example$/)
      expect(getSafeNext(decoded)).toBeNull()
    }
  })

  it("rejects other C0 control characters and DEL", () => {
    // The guard rejects the whole control range, not three special cases.
    expect(getSafeNext("/\u0000/evil.example")).toBeNull()
    expect(getSafeNext("/\u000B/evil.example")).toBeNull()
    expect(getSafeNext("/\u001F/evil.example")).toBeNull()
    expect(getSafeNext("/\u007F/evil.example")).toBeNull()
  })

  it("rejects a control character anywhere in the value, not just at the front", () => {
    expect(getSafeNext("/orders\t/../../evil.example")).toBeNull()
    expect(getSafeNext("/orders/new?recipe=a\nb")).toBeNull()
  })
})

describe("getSafeNext — percent-encoding is judged by resolution, not by looks", () => {
  it("keeps percent-encoded text that stays on the same origin", () => {
    // "%2F" is a literal path segment, not a separator, so this never leaves
    // the origin and must not be rejected just for containing "%".
    expect(getSafeNext("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example")
    expect(getSafeNext("/%5Cevil.example")).toBe("/%5Cevil.example")
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
