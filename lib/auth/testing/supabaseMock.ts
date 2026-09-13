// Test-only double for the server Supabase client (CORE-READY-G2-B2 suites).
//
// Records every table access, every write-shaped builder call and every RPC so
// the tests can assert the absence of organization bootstrap, not just the
// returned value. Not matched by Vitest's default *.test.* glob and never
// imported by application code.

import { vi } from "vitest"

type RpcResult = { data: unknown; error: { message: string } | null }

export type SupabaseMockOptions = {
  user?: { id: string; user_metadata?: Record<string, unknown> } | null
  profile?: Record<string, unknown> | null
  profileError?: { message: string } | null
  organization?: Record<string, unknown> | null
  rpc?: Record<string, RpcResult>
  exchangeError?: { message: string } | null
}

export type RecordedQuery = {
  table: string
  select?: string
  filters: Array<[string, unknown]>
}

export function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const queries: RecordedQuery[] = []
  const writes: string[] = []

  const rpc = vi.fn<(name: string, args?: Record<string, unknown>) => Promise<RpcResult>>(
    async (name) =>
      options.rpc?.[name] ?? { data: null, error: { message: `unexpected rpc ${name}` } }
  )

  function from(table: string) {
    const record: RecordedQuery = { table, filters: [] }
    queries.push(record)

    const result = async () => {
      if (table === "profiles") {
        return { data: options.profile ?? null, error: options.profileError ?? null }
      }
      if (table === "organizations") {
        return { data: options.organization ?? null, error: null }
      }
      return { data: null, error: null }
    }

    const write = (kind: string) => () => {
      writes.push(`${kind}:${table}`)
      return builder
    }

    const builder = {
      select(columns: string) {
        record.select = columns
        return builder
      },
      eq(column: string, value: unknown) {
        record.filters.push([column, value])
        return builder
      },
      single: result,
      maybeSingle: result,
      insert: write("insert"),
      update: write("update"),
      upsert: write("upsert"),
      delete: write("delete"),
    }
    return builder
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: options.user ?? null }, error: null })),
      exchangeCodeForSession: vi.fn<(code: string) => Promise<unknown>>(async () => ({
        data: { user: options.user ?? null, session: null },
        error: options.exchangeError ?? null,
      })),
    },
    from: vi.fn(from),
    rpc,
  }

  return { client, rpc, queries, writes }
}

/**
 * Collects every string rendered or passed as a prop in a server component's
 * element tree, without rendering it. Element `type`s (which may be circular
 * module objects, e.g. next/link) are skipped.
 */
export function elementStrings(node: unknown): string {
  const out: string[] = []
  const seen = new Set<unknown>()

  const walk = (value: unknown) => {
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value))
      return
    }
    if (!value || typeof value !== "object" || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    const props = (value as { props?: Record<string, unknown> }).props
    if (props) Object.values(props).forEach(walk)
  }

  walk(node)
  return out.join("\n")
}

/** Thrown by the mocked next/navigation redirect, mirroring NEXT_REDIRECT control flow. */
export class RedirectSignal extends Error {
  constructor(readonly destination: string) {
    super(`redirect:${destination}`)
  }
}
