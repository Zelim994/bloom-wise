// Runtime proof for public.create_my_organization.
//
// This is the owner-bootstrap domain command: after CORE-READY-G2-B2 it becomes
// the ONLY place in the application that creates an organization. These
// scenarios cover the two defects that closing the implicit call sites does not
// fix on its own — an orphan organization when the profile row is missing, and
// a second organization created by a concurrent call.
//
// Everything runs against the local bloomwise-e2e database only, through the
// same fail-closed connection guard as the order-bouquet suite. Fixtures are
// created as `postgres` (local test administration); every RPC invocation
// happens as an authenticated actor. service_role is never used.
//
// All identifiers are unmistakably synthetic: no real name, email or phone, and
// no production UUID appears anywhere.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import type { Client } from "pg"
import { asPgError, assertCanonicalLocalDatabase, connect } from "./support/db"

const PREFIX = "bw-itest-bootstrap"
const RPC = "select public.create_my_organization($1::text) as org_id"

/** Deterministic synthetic auth users — visibly fake, no collision with real data. */
const USER = {
  fresh: "cccc0001-0000-4000-8000-000000000001",
  retry: "cccc0001-0000-4000-8000-000000000002",
  orphan: "cccc0001-0000-4000-8000-000000000003",
  race: "cccc0001-0000-4000-8000-000000000004",
} as const

const ALL_USERS = Object.values(USER)

let admin: Client
/** Independent connection for reading committed state — never an actor's. */
let observer: Client

/** Creates the auth user; the on_auth_user_created trigger inserts the profile. */
async function createUser(id: string): Promise<void> {
  await admin.query(`insert into auth.users (id, email) values ($1, $2)`, [
    id,
    `${PREFIX}-${id.slice(0, 13)}@example.test`,
  ])
}


/**
 * Calls the RPC as an authenticated actor and COMMITS.
 *
 * The order-bouquet suite's withAuthenticatedActor always rolls back and
 * asserts a known organization — neither fits here: bootstrap scenarios have to
 * persist so the next call observes the committed row, and the actor's
 * organization is precisely what is under test (null before, set after).
 * Identity is still asserted before the call, so nothing can accidentally run
 * as postgres and bypass the EXECUTE grant.
 */
async function bootstrapAsActor(client: Client, userId: string, orgName: string): Promise<string> {
  await client.query("begin")
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId])
    await client.query("set local role authenticated")
    const { rows: identity } = await client.query<{ who: string; uid: string | null }>(
      "select current_user as who, auth.uid()::text as uid",
    )
    if (identity[0].who !== "authenticated") {
      throw new Error(`actor context is '${identity[0].who}', expected 'authenticated'`)
    }
    if (identity[0].uid !== userId) {
      throw new Error(`auth.uid() is ${identity[0].uid}, expected ${userId}`)
    }

    const { rows } = await client.query<{ org_id: string }>(RPC, [orgName])
    await client.query("commit")
    return rows[0].org_id
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    throw error
  }
}

async function readProfile(userId: string) {
  const { rows } = await observer.query<{ organization_id: string | null; role: string }>(
    `select organization_id, role from public.profiles where id = $1`,
    [userId],
  )
  return rows[0] ?? null
}

/** Organizations this suite could possibly have created. */
async function orgCount(): Promise<number> {
  const { rows } = await observer.query<{ n: string }>(
    `select count(*)::text as n from public.organizations where name like $1`,
    [`${PREFIX}%`],
  )
  return Number(rows[0].n)
}

/** Organizations belonging to nobody — the D1 symptom. */
async function orphanCount(): Promise<number> {
  const { rows } = await observer.query<{ n: string }>(
    `select count(*)::text as n
       from public.organizations o
      where o.name like $1
        and not exists (select 1 from public.profiles p where p.organization_id = o.id)`,
    [`${PREFIX}%`],
  )
  return Number(rows[0].n)
}

async function cleanup(): Promise<void> {
  await admin.query(`delete from public.organizations where name like $1`, [`${PREFIX}%`])
  await admin.query(`delete from auth.users where id = any($1::uuid[])`, [ALL_USERS])
}

beforeAll(async () => {
  admin = await connect()
  observer = await connect()
  await assertCanonicalLocalDatabase(admin)
  await cleanup() // clear any residue from an earlier interrupted run
})

afterAll(async () => {
  await cleanup()
  await Promise.all([admin.end(), observer.end()].map((p) => p.catch(() => undefined)))
})

describe("create_my_organization", () => {
  afterEach(async () => {
    // Each scenario commits, so state is reset between scenarios rather than
    // relying on a transaction rollback.
    await cleanup()
  })

  it("G2-B1-T1 binds a fresh profile to a new organization as owner", async () => {
    await createUser(USER.fresh)
    const before = await readProfile(USER.fresh)
    expect(before).toEqual({ organization_id: null, role: "florist" })

    const orgId = await bootstrapAsActor(admin, USER.fresh, `${PREFIX} salon`)

    expect(orgId).toBeTruthy()
    expect(await readProfile(USER.fresh)).toEqual({ organization_id: orgId, role: "owner" })
    expect(await orgCount()).toBe(1)
    expect(await orphanCount()).toBe(0)
  })

  it("G2-B1-T2 returns the same organization on a legitimate retry", async () => {
    await createUser(USER.retry)

    const first = await bootstrapAsActor(admin, USER.retry, `${PREFIX} retry`)
    const second = await bootstrapAsActor(admin, USER.retry, `${PREFIX} retry`)

    expect(second).toBe(first)
    expect(await orgCount()).toBe(1)
    expect(await orphanCount()).toBe(0)
    // A retry must not rewrite anything that already exists.
    expect(await readProfile(USER.retry)).toEqual({ organization_id: first, role: "owner" })
  })

  it("G2-B1-T3 fails without creating an orphan when the profile is missing", async () => {
    await createUser(USER.orphan)
    // Remove only the profile, leaving the auth identity intact — the exact
    // state that used to produce an ownerless organization.
    await admin.query(`delete from public.profiles where id = $1`, [USER.orphan])
    expect(await readProfile(USER.orphan)).toBeNull()

    const before = await orgCount()
    let message = ""
    try {
      await bootstrapAsActor(admin, USER.orphan, `${PREFIX} orphan`)
    } catch (error) {
      message = asPgError(error).message
    }

    expect(message).toContain("Профиль пользователя не найден")
    expect(await orgCount()).toBe(before)
    expect(await orphanCount()).toBe(0)
  })

  it("G2-B1-T4 serializes concurrent bootstrap on the profile row", async () => {
    await createUser(USER.race)

    const s1 = await connect()
    const s2 = await connect()
    const watcher = await connect()
    try {
      // ---- session 1: call the RPC, then hold the transaction open ----------
      await s1.query("begin")
      await s1.query("select set_config('request.jwt.claim.sub', $1, true)", [USER.race])
      await s1.query("set local role authenticated")
      const { rows: r1 } = await s1.query<{ org_id: string }>(RPC, [`${PREFIX} race one`])
      const org1 = r1[0].org_id
      const { rows: [p1] } = await s1.query<{ pid: number }>("select pg_backend_pid() as pid")

      // ---- session 2: same actor, must block on session 1's profile lock ----
      await s2.query("begin")
      await s2.query("select set_config('request.jwt.claim.sub', $1, true)", [USER.race])
      await s2.query("set local role authenticated")
      const { rows: [p2] } = await s2.query<{ pid: number }>("select pg_backend_pid() as pid")

      const pending = s2.query<{ org_id: string }>(RPC, [`${PREFIX} race two`])
      let settled = false
      pending.then(() => { settled = true }).catch(() => { settled = true })

      // Blocking is proven from pg_locks, not from a timeout.
      await new Promise((resolve) => setTimeout(resolve, 300))
      const { rows: [blocked] } = await watcher.query<{ blockers: number[] }>(
        "select pg_blocking_pids($1) as blockers", [p2.pid],
      )
      expect(settled).toBe(false)
      expect(blocked.blockers).toContain(p1.pid)

      // ---- release: session 2 must reuse session 1's organization ----------
      await s1.query("commit")
      const { rows: r2 } = await pending
      await s2.query("commit")

      expect(r2[0].org_id).toBe(org1)
      expect(await readProfile(USER.race)).toEqual({ organization_id: org1, role: "owner" })
      expect(await orgCount()).toBe(1)     // the second call created nothing
      expect(await orphanCount()).toBe(0)
    } finally {
      await s1.query("rollback").catch(() => undefined)
      await s2.query("rollback").catch(() => undefined)
      await Promise.all([s1.end(), s2.end(), watcher.end()].map((p) => p.catch(() => undefined)))
    }
  })
})
