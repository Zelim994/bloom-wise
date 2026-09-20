// Real end-to-end proof for RECIPE-SAVE-ATOMIC.
//
// Nothing is mocked: a real Chrome logs in against the isolated local Supabase
// stack, the real RecipeForm + BuilderLayout are driven through the real
// Next.js dev server, the real `upsertRecipe` Server Action runs on that server
// and issues the real authenticated PostgREST call to save_recipe_atomic. The
// result is then read back with a direct, guarded connection to the local
// database and compared field by field — first for a freshly CREATED recipe,
// then for the same recipe EDITED (different header, different composition,
// same id).
//
// ── What this proves, stated exactly ──────────────────────────────────────
//   * a browser session authenticated through GoTrue can create and edit a
//     recipe end to end;
//   * the persisted header and composition equal what was typed, and the edit
//     REPLACES the composition (exactly the new rows, same recipe id, still one
//     recipe in the organization);
//   * organization_id on the row is the logged-in user's organization, which the
//     database derives from auth.uid() — the payload never carries it.
// What it does NOT observe directly: the PostgREST request itself, because the
// Server Action runs server-side, outside the browser. It is inferred from the
// code path (upsertRecipe has exactly one write path) plus the persisted result.
//
// ── Safety model ─────────────────────────────────────────────────────────
//   * refuses to run if any production marker is present in the environment
//     (reuses validateEnvironment from the sanctioned wrapper);
//   * validates e2e/supabase/config.toml through the wrapper's own gate and
//     runs `npm run e2e:db:check` before touching anything;
//   * the database handle comes from the integration support module, so
//     assertCanonicalLocalDatabase applies unchanged; API endpoint must be
//     exactly http://127.0.0.1:54421;
//   * local keys are read from `supabase status --output json` through a child
//     process and kept in memory only — never printed, never written to the
//     evidence file, never placed in a file on disk;
//   * the Next dev server is started on a free loopback port with a MINIMAL env
//     (known-secret names are passed as empty strings so a local .env.local
//     cannot supply them, and @next/env never overwrites a defined variable);
//   * Chrome resolves nothing but loopback (--host-resolver-rules), uses no
//     proxy, and Playwright aborts every request outside the two allowed
//     origins; any such request fails the run;
//   * fixtures are random UUIDs under an .invalid email domain and are deleted
//     by their own ids in `finally`; no reset, no truncate, no prefix sweep.
//
// Requirements: Node >= 22.18 (imports the TypeScript support module directly),
// a running local stack (`npm run e2e:db:start`), migration_038 applied to it,
// and BLOOMWISE_BROWSER_EVIDENCE_DIR pointing at a writable directory.
//
// Note: the dev server compiles into this worktree's own .next directory. Do
// not run another dev server in this worktree at the same time.

import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { mkdir, stat, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { chromium } from "playwright"

import { assertCanonicalLocalDatabase, connect } from "../e2e/integration/support/db.ts"
import {
  parseConfigSubset,
  resolvePaths,
  validateConfig,
  validateEnvironment,
} from "./e2e-supabase.mjs"

// ─── constants ───────────────────────────────────────────────────────────────

/** The only Supabase API endpoint this script will talk to. */
const EXPECTED_API_ORIGIN = "http://127.0.0.1:54421"
const EXPECTED_DB_HOST = "127.0.0.1"
const EXPECTED_DB_PORT = 54422

const CHROME_DEFAULT = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

/**
 * Names the dev server must NOT inherit from a local .env file. Passing them as
 * empty strings is what blocks that: @next/env only fills variables that are
 * undefined, and an empty string is defined.
 */
const NEUTRALIZED_ENV_NAMES = [
  "OPENAI_API_KEY",
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_QUALITY",
  "GEMINI_API_KEY",
  "NANO_BANANA_IMAGE_MODEL",
  "NANO_BANANA_IMAGE_SIZE",
  "AI_IMAGE_PROVIDER",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RECIPE_PATH_RE = /^\/recipes\/[0-9a-f-]{36}$/i

const DEV_SERVER_TIMEOUT_MS = 240_000
// Generous on purpose: a dev server compiles each route on first visit.
const PAGE_TIMEOUT_MS = 90_000
const SAVE_TIMEOUT_MS = 120_000

// ─── small helpers ───────────────────────────────────────────────────────────

class Refusal extends Error {
  constructor(failures) {
    super(`REFUSED — RECIPE-SAVE-ATOMIC real browser E2E\n  - ${failures.join("\n  - ")}`)
    this.name = "Refusal"
  }
}

function refuse(failures) {
  throw new Refusal(failures)
}

/** Money as PostgreSQL renders numeric(10,2)::text, so comparisons are exact. */
function money(value) {
  return value.toFixed(2)
}

function pickKey(source, candidates) {
  for (const key of candidates) {
    const value = source[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return null
}

async function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/**
 * Minimal environment for every child process. Nothing is inherited wholesale:
 * a production value present in this shell must not reach the dev server.
 */
function childEnv(extra = {}) {
  const base = {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: process.env.HOME ?? "",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    LANG: process.env.LANG ?? "en_US.UTF-8",
    NEXT_TELEMETRY_DISABLED: "1",
    CI: "1",
  }
  for (const name of NEUTRALIZED_ENV_NAMES) base[name] = ""
  return { ...base, ...extra }
}

/** Docker-addressing variables the CLI may legitimately need. Never printed. */
function dockerEnv() {
  const forwarded = {}
  for (const name of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"]) {
    if (typeof process.env[name] === "string") forwarded[name] = process.env[name]
  }
  return forwarded
}

// ─── preflight ───────────────────────────────────────────────────────────────

function preflight(repoRoot, configPath) {
  // 1. The shell itself must not be pointed at production.
  const env = validateEnvironment(process.env)
  if (!env.ok) refuse(env.failures)

  // 2. The stack config must be exactly the isolated E2E one.
  let raw
  try {
    raw = readFileSync(configPath, "utf8")
  } catch {
    refuse([`cannot read config at ${configPath}`])
  }
  const config = validateConfig(parseConfigSubset(raw))
  if (!config.ok) refuse(config.failures)

  // 3. The sanctioned wrapper gets the final word on whether the stack is safe.
  const check = spawnSync("npm", ["run", "e2e:db:check"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: childEnv(dockerEnv()),
  })
  if (check.status !== 0) {
    refuse(["`npm run e2e:db:check` refused or failed — fix the stack before running this script"])
  }
}

/**
 * Reads the local stack's endpoints and keys. The JSON is parsed in memory and
 * the keys are returned as values only — they are never logged, never written
 * to the evidence file and never put into a file.
 */
function readLocalStack(workdir) {
  const result = spawnSync("supabase", ["--workdir", workdir, "status", "--output", "json"], {
    encoding: "utf8",
    env: childEnv(dockerEnv()),
  })
  if (result.status !== 0) {
    refuse([
      "`supabase status` failed — start the isolated stack first (npm run e2e:db:start)",
    ])
  }

  const text = result.stdout ?? ""
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) refuse(["could not parse `supabase status --output json`"])

  let status
  try {
    status = JSON.parse(text.slice(start, end + 1))
  } catch {
    refuse(["`supabase status --output json` did not return valid JSON"])
  }

  const apiUrl = pickKey(status, ["API_URL", "api_url"])
  const anonKey = pickKey(status, ["ANON_KEY", "anon_key", "PUBLISHABLE_KEY", "publishable_key"])
  const serviceKey = pickKey(status, [
    "SERVICE_ROLE_KEY",
    "service_role_key",
    "SECRET_KEY",
    "secret_key",
  ])
  const dbUrl = pickKey(status, ["DB_URL", "db_url"])

  const failures = []
  if (!apiUrl) failures.push("status JSON carries no API URL")
  if (!anonKey) failures.push("status JSON carries no anon/publishable key")
  if (!serviceKey) failures.push("status JSON carries no service-role/secret key")
  if (failures.length > 0) refuse(failures)

  const api = new URL(apiUrl)
  if (api.origin !== EXPECTED_API_ORIGIN) {
    refuse([`API endpoint is ${api.origin}, expected exactly ${EXPECTED_API_ORIGIN}`])
  }
  if (dbUrl) {
    const db = new URL(dbUrl)
    if (db.hostname !== EXPECTED_DB_HOST || Number(db.port) !== EXPECTED_DB_PORT) {
      refuse([`database endpoint is ${db.hostname}:${db.port}, expected ${EXPECTED_DB_HOST}:${EXPECTED_DB_PORT}`])
    }
  }

  return { apiOrigin: api.origin, anonKey, serviceKey }
}

// ─── fixtures ────────────────────────────────────────────────────────────────

function makeFixture() {
  const tag = randomUUID().slice(0, 8)
  return {
    tag,
    orgId: randomUUID(),
    userId: null,
    email: `bw-e2e-${tag}@bloomwise.invalid`,
    // Never logged, never written to evidence.
    password: `Bw-${randomBytes(18).toString("base64url")}`,
    flowerA: { id: randomUUID(), name: `bw-e2e ${tag} роза`, cost: 12.5, sale: 40, stock: 120 },
    flowerB: { id: randomUUID(), name: `bw-e2e ${tag} эвкалипт`, cost: 7.25, sale: 20, stock: 80 },
  }
}

async function createAuthUser(apiOrigin, serviceKey, fixture) {
  const response = await fetch(`${apiOrigin}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: fixture.email,
      password: fixture.password,
      // Confirmed on creation: no mail is generated and no inbox is needed.
      email_confirm: true,
    }),
  })
  if (!response.ok) {
    // Status only — the body may echo configuration back at us.
    throw new Error(`local Auth admin create failed with HTTP ${response.status}`)
  }
  const body = await response.json()
  if (!UUID_RE.test(body?.id ?? "")) throw new Error("local Auth admin returned no user id")
  return body.id
}

async function seedFixtures(db, apiOrigin, serviceKey, fixture) {
  await db.query(`insert into public.organizations (id, name) values ($1, $2)`, [
    fixture.orgId,
    `bw-e2e ${fixture.tag}`,
  ])

  fixture.userId = await createAuthUser(apiOrigin, serviceKey, fixture)

  // The on_auth_user_created trigger owns the profile row; we only bind it.
  const profile = await db.query(
    `update public.profiles
        set organization_id = $1, role = 'owner', full_name = $2, is_active = true
      where id = $3`,
    [fixture.orgId, `bw-e2e ${fixture.tag}`, fixture.userId],
  )
  if (profile.rowCount !== 1) {
    throw new Error("profile row for the fixture user was not created by the auth trigger")
  }

  for (const flower of [fixture.flowerA, fixture.flowerB]) {
    await db.query(
      `insert into public.flowers (id, organization_id, name, category, unit, sale_price, is_active)
       values ($1, $2, $3, 'Срезка', 'шт', $4, true)`,
      [flower.id, fixture.orgId, flower.name, flower.sale],
    )
    // The builder lists a flower only when flower_variant_stock sees remaining
    // stock, and takes unit_cost from the oldest batch — hence a real batch.
    await db.query(
      `insert into public.inventory_items
         (organization_id, flower_id, arrived_at, cost_price, quantity_in, quantity_remaining)
       values ($1, $2, current_date, $3, $4, $4)`,
      [fixture.orgId, flower.id, flower.cost, flower.stock],
    )
  }
}

async function cleanupFixtures(db, fixture) {
  const report = {}
  const steps = [
    ["recipe_items", `delete from public.recipe_items ri using public.recipes r
                       where ri.recipe_id = r.id and r.organization_id = $1`, [fixture.orgId]],
    ["recipes", `delete from public.recipes where organization_id = $1`, [fixture.orgId]],
    ["inventory_items", `delete from public.inventory_items where organization_id = $1`, [fixture.orgId]],
    ["flowers", `delete from public.flowers where organization_id = $1`, [fixture.orgId]],
    ["organizations", `delete from public.organizations where id = $1`, [fixture.orgId]],
  ]
  if (fixture.userId) {
    steps.push(["auth_users", `delete from auth.users where id = $1`, [fixture.userId]])
  }

  for (const [name, sql, params] of steps) {
    try {
      const result = await db.query(sql, params)
      report[name] = result.rowCount ?? 0
    } catch (error) {
      report[name] = `failed: ${error instanceof Error ? error.name : "unknown"}`
    }
  }
  return report
}

// ─── dev server ──────────────────────────────────────────────────────────────

async function startDevServer(repoRoot, port, apiOrigin, anonKey) {
  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--port", String(port), "--hostname", "127.0.0.1"],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnv({
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: apiOrigin,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      }),
    },
  )

  // Server output is scanned for the bound URL and then discarded: it can
  // contain request detail and raw errors, which must not be logged.
  let tail = ""
  let announced = null
  const absorb = (chunk) => {
    tail = (tail + chunk.toString()).slice(-8192)
    const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(tail)
    if (match) announced = Number(match[1])
  }
  child.stdout.on("data", absorb)
  child.stderr.on("data", absorb)

  let exited = false
  child.on("exit", () => {
    exited = true
  })
  // Without a listener a spawn error would surface as an uncaught exception and
  // skip the cleanup in `finally`.
  child.on("error", () => {
    exited = true
  })

  const origin = `http://127.0.0.1:${port}`
  const deadline = Date.now() + DEV_SERVER_TIMEOUT_MS
  let ready = false
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(`${origin}/login`, { redirect: "manual", signal: AbortSignal.timeout(30_000) })
      if (response.status < 500) {
        ready = true
        break
      }
    } catch {
      // not listening yet
    }
    await sleep(500)
  }

  if (!ready) {
    await stopDevServer(child)
    refuse([exited ? "the Next dev server exited during startup" : "the Next dev server did not become ready in time"])
  }
  if (announced != null && announced !== port) {
    await stopDevServer(child)
    refuse([`the dev server bound port ${announced} instead of the reserved ${port} — rerun`])
  }

  return { child, origin }
}

async function stopDevServer(child) {
  if (!child || child.exitCode != null) return
  const exited = new Promise((resolve) => child.once("exit", resolve))
  child.kill("SIGTERM")
  const timer = sleep(10_000).then(() => "timeout")
  if ((await Promise.race([exited.then(() => "exited"), timer])) === "timeout") {
    child.kill("SIGKILL")
    await exited
  }
}

// ─── browser driving ─────────────────────────────────────────────────────────

const STOCK_ADD_BUTTON = /^(Добавить|×\d+)$/

async function addFromStock(page, flowerName, times) {
  const search = page.getByPlaceholder("Поиск...")
  await search.fill(flowerName)
  const button = page.getByRole("button", { name: STOCK_ADD_BUTTON })
  await button.first().waitFor({ state: "visible" })
  assert.equal(await button.count(), 1, `stock search for ${flowerName} did not narrow to one row`)
  for (let i = 0; i < times; i++) await button.first().click()
  await search.fill("")
}

/** Index of the quantity input whose row mentions `flowerName`, ancestor-walked. */
async function quantityInputIndex(page, flowerName) {
  const index = await page.evaluate((name) => {
    const inputs = Array.from(document.querySelectorAll('input[type="number"][min="1"]'))
    return inputs.findIndex((input) => {
      let node = input
      for (let depth = 0; depth < 6 && node; depth++) {
        if (node.textContent && node.textContent.includes(name)) return true
        node = node.parentElement
      }
      return false
    })
  }, flowerName)
  assert.notEqual(index, -1, `no composition row found for ${flowerName}`)
  return index
}

async function setQuantity(page, flowerName, quantity) {
  const index = await quantityInputIndex(page, flowerName)
  await page.locator('input[type="number"][min="1"]').nth(index).fill(String(quantity))
}

async function fillHeader(page, header) {
  await page.getByPlaceholder("Нежный рассвет").fill(header.name)

  const priceInputs = page.locator('input[type="number"][min="0"][step="50"]')
  assert.equal(
    await priceInputs.count(),
    2,
    "expected exactly two price inputs (recipe recommended price, builder sale price)",
  )
  // Document order: the recipe's own field precedes the builder.
  await priceInputs.first().fill(String(header.recommendedPrice))

  await page.getByPlaceholder("Начинаем с каркаса из зелени...").fill(header.assemblyNotes)
  await page.getByPlaceholder("Для особых случаев...").fill(header.comment)
  await page.getByRole("button", { name: header.style, exact: true }).click()
}

/**
 * Waits for one of the two possible outcomes of a save and reports which.
 * Polled rather than raced so a losing promise cannot reject unobserved.
 */
async function waitForSaveOutcome(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const pathname = new URL(page.url()).pathname
    if (RECIPE_PATH_RE.test(pathname)) return { kind: "saved", id: pathname.split("/")[2] }
    const alert = page.locator("form").getByRole("alert")
    if ((await alert.count()) > 0) {
      // The app's own user-facing message, not a raw server error.
      return { kind: "refused", message: (await alert.first().innerText()).trim() }
    }
    await sleep(250)
  }
  return { kind: "timeout" }
}

async function saveRecipe(page) {
  await page.getByRole("button", { name: "Сохранить рецепт", exact: true }).click()
  const outcome = await waitForSaveOutcome(page, SAVE_TIMEOUT_MS)
  if (outcome.kind !== "saved") {
    throw new Error(
      outcome.kind === "refused"
        ? `the form refused the save: ${outcome.message}`
        : "the save produced neither a navigation nor an error within the timeout",
    )
  }
  return outcome.id
}

// ─── database verification ───────────────────────────────────────────────────

async function readRecipe(db, recipeId) {
  const recipe = await db.query(
    `select id, organization_id, name, style, assembly_notes, comment, is_active,
            cost_price::text  as cost_price,
            recommended_price::text as recommended_price,
            margin_percent::text    as margin_percent
       from public.recipes where id = $1`,
    [recipeId],
  )
  const items = await db.query(
    `select flower_id, variety_id, color_id, product_id, quantity, unit_cost::text as unit_cost
       from public.recipe_items where recipe_id = $1
      order by quantity, unit_cost`,
    [recipeId],
  )
  return { recipe: recipe.rows[0] ?? null, items: items.rows }
}

/**
 * Compares the persisted row with what was typed. margin_percent is checked
 * numerically with a cent of tolerance because PostgreSQL rounds numeric(5,2)
 * itself and JavaScript cannot reproduce that arithmetic exactly.
 */
function compareRecipe(actual, expected) {
  const differences = []
  const header = actual.recipe
  if (!header) return { match: false, differences: ["recipe row is missing"] }

  const scalarChecks = {
    organization_id: expected.organizationId,
    name: expected.name,
    style: expected.style,
    assembly_notes: expected.assemblyNotes,
    comment: expected.comment,
    is_active: true,
    cost_price: money(expected.costPrice),
    recommended_price: money(expected.recommendedPrice),
  }
  for (const [field, want] of Object.entries(scalarChecks)) {
    if (header[field] !== want) {
      differences.push(`${field}: expected ${JSON.stringify(want)}, found ${JSON.stringify(header[field])}`)
    }
  }

  const margin = Number(header.margin_percent)
  if (!Number.isFinite(margin) || Math.abs(margin - expected.marginPercent) > 0.01) {
    differences.push(`margin_percent: expected ≈${expected.marginPercent.toFixed(2)}, found ${header.margin_percent}`)
  }

  const wantItems = [...expected.items]
    .map((item) => ({
      flower_id: item.flowerId,
      variety_id: null,
      color_id: null,
      product_id: null,
      quantity: item.quantity,
      unit_cost: money(item.unitCost),
    }))
    // Same ordering the read query uses: numeric, not lexicographic.
    .sort((a, b) => a.quantity - b.quantity || Number(a.unit_cost) - Number(b.unit_cost))

  if (actual.items.length !== wantItems.length) {
    differences.push(`item count: expected ${wantItems.length}, found ${actual.items.length}`)
  } else {
    actual.items.forEach((row, index) => {
      const want = wantItems[index]
      for (const field of Object.keys(want)) {
        if (row[field] !== want[field]) {
          differences.push(
            `items[${index}].${field}: expected ${JSON.stringify(want[field])}, found ${JSON.stringify(row[field])}`,
          )
        }
      }
    })
  }

  return { match: differences.length === 0, differences }
}

function expectedFor(fixture, header, composition) {
  const costPrice = composition.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
  const recommendedPrice = header.recommendedPrice
  return {
    organizationId: fixture.orgId,
    name: header.name,
    style: header.style,
    assemblyNotes: header.assemblyNotes,
    comment: header.comment,
    costPrice,
    recommendedPrice,
    marginPercent:
      recommendedPrice > 0 ? ((recommendedPrice - costPrice) / recommendedPrice) * 100 : 0,
    items: composition,
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

const { repoRoot, workdir, configPath } = resolvePaths(import.meta.url)

const evidenceDir = process.env.BLOOMWISE_BROWSER_EVIDENCE_DIR
if (!evidenceDir || !path.isAbsolute(evidenceDir)) {
  refuse(["BLOOMWISE_BROWSER_EVIDENCE_DIR must be set to an absolute directory path"])
}
await mkdir(evidenceDir, { recursive: true })

preflight(repoRoot, configPath)
const { apiOrigin, anonKey, serviceKey } = readLocalStack(workdir)

const fixture = makeFixture()
const evidence = {
  scope:
    "Real Chrome + real Next dev server + real Server Action + real local Supabase; " +
    "no mocked action, no mocked RPC, no production target",
  startedAt: new Date().toISOString(),
  app: { origin: null, envLocalPresent: false },
  supabase: {
    apiOrigin,
    database: `${EXPECTED_DB_HOST}:${EXPECTED_DB_PORT}`,
    keySource: "supabase status --output json, held in memory only",
  },
  fixtures: {
    tag: fixture.tag,
    organizationId: fixture.orgId,
    userId: null,
    emailDomain: "bloomwise.invalid",
    flowerIds: [fixture.flowerA.id, fixture.flowerB.id],
  },
  network: { allowedOrigins: [], blockedExternal: 0, blockedSample: [], pageErrors: 0 },
  serverActionPosts: [],
  supabaseBrowserCalls: [],
  create: null,
  edit: null,
  cleanup: null,
  result: "incomplete",
}

let db = null
let devServer = null
let browser = null
let failure = null
let fixturesOwned = false
function safeError(error) {
  let value = error instanceof Error ? `${error.name}: ${error.message}` : "unknown failure"
  for (const secret of [anonKey, serviceKey, fixture.password]) {
    if (secret) value = value.split(secret).join("[REDACTED]")
  }
  return value
}

try {
  try {
    await stat(path.join(repoRoot, ".env.local"))
    evidence.app.envLocalPresent = true
  } catch {
    evidence.app.envLocalPresent = false
  }

  db = await connect()
  await assertCanonicalLocalDatabase(db)

  const { rows: fn } = await db.query(
    `select count(*)::int as n from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'save_recipe_atomic'`,
  )
  if (fn[0].n !== 1) {
    refuse([
      "public.save_recipe_atomic is missing from the local stack — apply " +
      "e2e/supabase/migrations/20260920120000_atomic_recipe_save.sql first",
    ])
  }

  fixturesOwned = true // identity and RPC gates passed; cleanup only this random tenant
  await seedFixtures(db, apiOrigin, serviceKey, fixture)
  evidence.fixtures.userId = fixture.userId

  const port = await freeLoopbackPort()
  devServer = await startDevServer(repoRoot, port, apiOrigin, anonKey)
  evidence.app.origin = devServer.origin
  evidence.network.allowedOrigins = [devServer.origin, apiOrigin]

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || CHROME_DEFAULT,
    args: [
      // Network-level guarantee: nothing but loopback can even be resolved.
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      "--no-proxy-server",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-sync",
      "--no-pings",
      "--no-first-run",
      "--no-default-browser-check",
      "--metrics-recording-only",
    ],
  })

  const context = await browser.newContext({ serviceWorkers: "block" })
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url())
    if (url.origin === devServer.origin || url.origin === apiOrigin) return route.continue()
    evidence.network.blockedExternal++
    if (evidence.network.blockedSample.length < 5) {
      evidence.network.blockedSample.push(url.origin + url.pathname)
    }
    return route.abort()
  })

  const page = await context.newPage()
  page.setDefaultTimeout(PAGE_TIMEOUT_MS)
  page.on("pageerror", () => {
    evidence.network.pageErrors++
  })
  page.on("response", (response) => {
    const url = new URL(response.url())
    const method = response.request().method()
    // Paths and statuses only: never headers, bodies, cookies or tokens.
    if (url.origin === devServer.origin && method === "POST") {
      evidence.serverActionPosts.push({ path: url.pathname, status: response.status() })
    }
    if (url.origin === apiOrigin) {
      evidence.supabaseBrowserCalls.push({ path: url.pathname, status: response.status() })
    }
  })

  // ── login through the real form ───────────────────────────────────────────
  await page.goto(new URL("/login", devServer.origin).href)
  await page.locator("#email").fill(fixture.email)
  await page.locator("#password").fill(fixture.password)
  await page.getByRole("button", { name: "Войти", exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: PAGE_TIMEOUT_MS })

  // ── create ────────────────────────────────────────────────────────────────
  const createHeader = {
    name: `bw-e2e ${fixture.tag} создан`,
    style: "премиум",
    assemblyNotes: `сборка ${fixture.tag}`,
    comment: `комментарий ${fixture.tag}`,
    recommendedPrice: 4000,
  }
  const createComposition = [
    { flowerId: fixture.flowerA.id, quantity: 2, unitCost: fixture.flowerA.cost },
    { flowerId: fixture.flowerB.id, quantity: 1, unitCost: fixture.flowerB.cost },
  ]

  await page.goto(new URL("/recipes/new", devServer.origin).href)
  await page.getByPlaceholder("Поиск...").waitFor({ state: "visible" })
  await addFromStock(page, fixture.flowerA.name, 2)
  await addFromStock(page, fixture.flowerB.name, 1)
  await fillHeader(page, createHeader)
  const createdId = await saveRecipe(page)
  await page.screenshot({ path: path.join(evidenceDir, "created.png"), fullPage: true })

  const createdExpected = expectedFor(fixture, createHeader, createComposition)
  const createdActual = await readRecipe(db, createdId)
  const createdComparison = compareRecipe(createdActual, createdExpected)
  evidence.create = {
    recipeId: createdId,
    expected: createdExpected,
    actual: createdActual,
    ...createdComparison,
  }
  assert.ok(
    createdComparison.match,
    `created recipe does not match what was typed:\n  ${createdComparison.differences.join("\n  ")}`,
  )

  // ── edit: different header AND different composition, same recipe ─────────
  const editHeader = {
    name: `bw-e2e ${fixture.tag} изменён`,
    style: "яркий",
    assemblyNotes: `новая сборка ${fixture.tag}`,
    comment: `новый комментарий ${fixture.tag}`,
    recommendedPrice: 5500,
  }
  const editComposition = [
    { flowerId: fixture.flowerA.id, quantity: 5, unitCost: fixture.flowerA.cost },
    { flowerId: fixture.flowerB.id, quantity: 2, unitCost: fixture.flowerB.cost },
  ]

  await page.goto(new URL(`/recipes/${createdId}/edit`, devServer.origin).href)
  await page.getByPlaceholder("Поиск...").waitFor({ state: "visible" })
  await setQuantity(page, fixture.flowerA.name, 5)
  await addFromStock(page, fixture.flowerB.name, 1) // 1 -> 2
  await fillHeader(page, editHeader)
  const editedId = await saveRecipe(page)
  await page.screenshot({ path: path.join(evidenceDir, "edited.png"), fullPage: true })

  assert.equal(editedId, createdId, "editing must keep the same recipe id")

  const editedExpected = expectedFor(fixture, editHeader, editComposition)
  const editedActual = await readRecipe(db, createdId)
  const editedComparison = compareRecipe(editedActual, editedExpected)

  const { rows: recipeCount } = await db.query(
    `select count(*)::int as n from public.recipes where organization_id = $1`,
    [fixture.orgId],
  )
  evidence.edit = {
    recipeId: editedId,
    sameIdAsCreate: true,
    recipesInOrganization: recipeCount[0].n,
    expected: editedExpected,
    actual: editedActual,
    ...editedComparison,
  }
  assert.ok(
    editedComparison.match,
    `edited recipe does not match what was typed:\n  ${editedComparison.differences.join("\n  ")}`,
  )
  assert.equal(recipeCount[0].n, 1, "the edit must replace the recipe, not create a second one")

  assert.equal(evidence.network.blockedExternal, 0, "the run attempted traffic outside the allowed origins")
  assert.equal(evidence.network.pageErrors, 0, "the page raised uncaught errors")
  assert.ok(
    evidence.serverActionPosts.some((call) => call.status === 200),
    "no successful Server Action POST was observed",
  )

  evidence.result = "passed"
} catch (error) {
  failure = error
  evidence.result = "failed"
  evidence.failure = safeError(error)
} finally {
  try {
    if (browser) await browser.close()
  } catch {
    // browser already gone
  }
  try {
    if (devServer) await stopDevServer(devServer.child)
  } catch {
    // server already gone
  }
  if (db) {
    try {
      evidence.cleanup = fixturesOwned ? await cleanupFixtures(db, fixture) : { skipped: true }
      if (Object.values(evidence.cleanup).some(value => typeof value === "string")) {
        failure ??= new Error("Fixture cleanup failed; inspect safe cleanup evidence")
        evidence.result = "failed"
        evidence.failure = safeError(failure)
      }
    } catch (error) {
      evidence.cleanup = { error: error instanceof Error ? error.name : "unknown" }
      failure ??= new Error("Fixture cleanup failed")
      evidence.result = "failed"
      evidence.failure = safeError(failure)
    }
    await db.end().catch(() => undefined)
  }
  evidence.finishedAt = new Date().toISOString()
  if (evidenceDir) {
    await writeFile(
      path.join(evidenceDir, "recipe-save-real-browser.json"),
      JSON.stringify(evidence, null, 2),
    )
  }
}

if (failure) {
  console.error(failure instanceof Refusal ? failure.message : `FAILED: ${evidence.failure}`)
  process.exitCode = 1
} else {
  console.log(
    JSON.stringify(
      {
        result: evidence.result,
        createdRecipeId: evidence.create?.recipeId,
        editedSameId: evidence.edit?.sameIdAsCreate,
        recipesInOrganization: evidence.edit?.recipesInOrganization,
        serverActionPosts: evidence.serverActionPosts.length,
        supabaseBrowserCalls: evidence.supabaseBrowserCalls.length,
        blockedExternal: evidence.network.blockedExternal,
        cleanup: evidence.cleanup,
        evidence: path.join(evidenceDir, "recipe-save-real-browser.json"),
      },
      null,
      2,
    ),
  )
}
