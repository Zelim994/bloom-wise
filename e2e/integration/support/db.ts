// Connection plumbing for the local BloomWise E2E database integration suite.
//
// Two rules shape this file:
//
//  1. FAIL CLOSED ON TARGET. The only database this harness may ever touch is
//     the local bloomwise-e2e stack on 127.0.0.1:54422. There is no
//     DATABASE_URL escape hatch, no fallback port, and the neighbouring
//     brain-dump stack's ports are denylisted explicitly. A generic connection
//     string cannot be smuggled in.
//
//  2. FAIL CLOSED ON ACTOR. replace_order_bouquet is a domain command for an
//     authenticated user. The pooled connection logs in as `postgres` because
//     local test administration (fixtures, observation, cleanup, concurrency
//     orchestration) needs it — but every RPC invocation goes through
//     withAuthenticatedActor, which switches the transaction to the
//     `authenticated` role with a concrete auth.uid() and refuses to proceed if
//     the identity does not resolve as expected. service_role is never used.

import { Client } from "pg"

/** The only target this harness will ever connect to. */
export const LOCAL_DB = {
  host: "127.0.0.1",
  port: 54422,
  database: "postgres",
  user: "postgres",
  password: "postgres",
} as const

/** Ports owned by the other local stack. Never a connection target. */
const BRAIN_DUMP_PORTS = [54320, 54321, 54322, 54323, 54324, 54327, 54329]

/** The canonical baseline this suite is written against. */
const CANONICAL_MIGRATION = "20260911180000"

function assertTargetIsLocalBloomWise(): void {
  if (LOCAL_DB.host !== "127.0.0.1") {
    throw new Error(`refusing non-local host ${LOCAL_DB.host}`)
  }
  if (LOCAL_DB.port !== 54422) {
    throw new Error(`refusing port ${LOCAL_DB.port}: only the bloomwise-e2e DB port is allowed`)
  }
  if ((BRAIN_DUMP_PORTS as readonly number[]).includes(LOCAL_DB.port)) {
    throw new Error(`refusing port ${LOCAL_DB.port}: belongs to the brain-dump stack`)
  }
}

export async function connect(): Promise<Client> {
  assertTargetIsLocalBloomWise()
  const client = new Client({ ...LOCAL_DB })
  await client.connect()
  return client
}

/**
 * Proves the connection really is the canonical local BloomWise database before
 * any fixture is written. Every check here is a reason to abort, not a warning.
 */
export async function assertCanonicalLocalDatabase(client: Client): Promise<void> {
  const { rows } = await client.query<{
    port: string
    migrations: string
    rpc: string
    counters: string
    diagnostic_fn: string
    ai_column: string
  }>(`
    select
      current_setting('port')                                                         as port,
      (select count(*)::text from supabase_migrations.schema_migrations
        where version = $1)                                                           as migrations,
      (select count(*)::text from pg_proc
        where pronamespace = 'public'::regnamespace and proname = 'replace_order_bouquet') as rpc,
      (select count(*)::text from pg_class
        where relnamespace = 'public'::regnamespace and relname = 'organization_order_counters') as counters,
      (select count(*)::text from pg_proc where proname = 'bw_plpgsql_test')          as diagnostic_fn,
      (select count(*)::text from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles'
          and column_name = 'ai_profile_enc')                                         as ai_column
  `, [CANONICAL_MIGRATION])

  const r = rows[0]
  const problems: string[] = []
  if (r.port !== "5432") problems.push(`unexpected server port ${r.port} (container-internal 5432 expected)`)
  if (r.migrations !== "1") problems.push(`canonical migration ${CANONICAL_MIGRATION} applied ${r.migrations} times, expected once`)
  if (r.rpc !== "1") problems.push("public.replace_order_bouquet is missing")
  if (r.counters !== "1") problems.push("public.organization_order_counters is missing")
  if (r.diagnostic_fn !== "0") problems.push("bw_plpgsql_test is present — this is not the cleaned baseline")
  if (r.ai_column !== "0") problems.push("profiles.ai_profile_enc is present — this is not the cleaned baseline")

  if (problems.length > 0) {
    throw new Error(`refusing to run against this database:\n  - ${problems.join("\n  - ")}`)
  }
}

export type ActorContext = {
  /** Runs a query inside the authenticated transaction. */
  query: Client["query"]
}

/**
 * Runs `body` inside a transaction whose current role is `authenticated` and
 * whose auth.uid() is `actorId`, then ALWAYS rolls back.
 *
 * The identity is asserted before `body` runs, so a scenario can never
 * accidentally exercise the RPC as `postgres` — which would bypass both the
 * function's EXECUTE grant and every RLS policy, and would make the test
 * meaningless.
 */
export async function withAuthenticatedActor<T>(
  client: Client,
  actorId: string,
  expectedOrgId: string | null,
  body: (ctx: ActorContext) => Promise<T>,
): Promise<T> {
  await client.query("begin")
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId])
    await client.query("set local role authenticated")

    const { rows } = await client.query<{ who: string; uid: string | null; org: string | null }>(
      "select current_user as who, auth.uid()::text as uid, public.get_user_organization_id()::text as org",
    )
    const identity = rows[0]
    if (identity.who !== "authenticated") {
      throw new Error(`actor context is '${identity.who}', expected 'authenticated'`)
    }
    if (identity.uid !== actorId) {
      throw new Error(`auth.uid() is ${identity.uid}, expected ${actorId}`)
    }
    if (identity.org !== expectedOrgId) {
      throw new Error(`get_user_organization_id() is ${identity.org}, expected ${expectedOrgId}`)
    }

    return await body({ query: client.query.bind(client) })
  } finally {
    // Always roll back: scenarios must not leak state into one another, and an
    // aborted transaction must be cleared before the client is reused.
    await client.query("rollback").catch(() => undefined)
  }
}

/** Postgres error shape we assert on (SQLSTATE + message). */
export type PgError = Error & { code?: string }

export function asPgError(error: unknown): PgError {
  if (error instanceof Error) return error as PgError
  return new Error(String(error)) as PgError
}
