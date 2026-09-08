// Parser anchor only. `.invalid` is reserved by RFC 2606 and can never
// resolve, and no request is ever made — the URL constructor is used purely to
// reproduce the same normalization a browser applies before navigating.
const PARSER_BASE = "https://bloomwise.invalid"

// C0 controls plus DEL. URL parsers strip TAB/LF/CR *before* parsing the
// authority, so "/\t/evil.example" silently becomes the protocol-relative
// "//evil.example" — which is why a raw-prefix check alone cannot be trusted.
// Legitimate routes never contain raw control characters.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

/**
 * Validates an attacker-controllable `next` value before it is used for
 * navigation. Returns the value unchanged when it is an internal path, or
 * null when it could leave the origin — callers pick their own landing route.
 */
export function getSafeNext(value: string | null | undefined): string | null {
  if (!value) return null

  // Reject before parsing: the parser would strip these and hide the payload.
  if (CONTROL_CHARS.test(value)) return null

  if (!value.startsWith("/")) return null

  let resolved: URL
  try {
    resolved = new URL(value, PARSER_BASE)
  } catch {
    // Unparseable input is never safe to navigate to.
    return null
  }

  // The origin check is what generalises this guard: "//host", "/\host" and
  // any other authority-normalization form resolves away from the base origin
  // and is rejected without needing its own special case.
  if (resolved.origin !== PARSER_BASE) return null

  // Return the original string — callers rely on the exact path, query and
  // hash they passed in, so nothing is canonicalized on the way out.
  return value
}
