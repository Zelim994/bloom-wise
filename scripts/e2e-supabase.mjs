// The only sanctioned entry point for controlling the local BloomWise E2E
// Supabase stack.
//
// Why this exists: another project's stack ("brain-dump") runs on this machine
// on the Supabase DEFAULT ports, including Postgres on 54322. A bare
// `supabase db reset` — or one that silently falls back to defaults — would
// wipe that project's database. Port and project separation already live in
// e2e/supabase/config.toml; this wrapper is the part that refuses to act when
// those values are not exactly what we expect.
//
// Design rules, all load-bearing:
//   * only four fixed actions; never an arbitrary shell string
//   * the Supabase CLI is spawned with an argument ARRAY, never a shell
//   * --workdir is computed from this file's own location, never accepted
//     from the caller, so `--workdir ../brain-dump` is unreachable
//   * every check fails closed: anything unproven is treated as unsafe

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// ─── constants ───────────────────────────────────────────────────────────────

export const PROJECT_ID = "bloomwise-e2e"

/** Exact values the config must carry. Anything else is refused. */
export const REQUIRED_CONFIG = {
  project_id: PROJECT_ID,
  "api.port": 54421,
  "db.port": 54422,
  "db.shadow_port": 54420,
  "db.pooler.port": 54429,
  "studio.port": 54423,
  "local_smtp.port": 54424,
  "analytics.port": 54427,
  "auth.site_url": "http://127.0.0.1:3100",
  "storage.enabled": true,
  "db.seed.enabled": false,
}

/** Ports owned by the other local stack. None may appear in our config. */
export const BRAIN_DUMP_PORTS = [54320, 54321, 54322, 54323, 54324, 54327, 54329]

export const BRAIN_DUMP_PROJECT_ID = "brain-dump"
export const PRODUCTION_REF = "ovqbebfesbhmmkjhasum"
export const REMOTE_HOST_MARKER = ".supabase.co"

export const DB_CONTAINER = `supabase_db_${PROJECT_ID}`
export const CONTAINER_SUFFIX = `_${PROJECT_ID}`

// ─── config parsing ──────────────────────────────────────────────────────────

/**
 * Every scalar shape our controlled config can hold.
 * @typedef {string | number | boolean | Array<string | number | boolean>} ConfigValue
 * @typedef {Record<string, ConfigValue>} ConfigValues
 */

/**
 * Strips TOML comments while respecting double-quoted strings, so a `#` inside
 * a value is preserved and prose in comments cannot influence any check.
 */
export function stripComments(text) {
  return text
    .split("\n")
    .map((line) => {
      let inString = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"' && line[i - 1] !== "\\") inString = !inString
        if (ch === "#" && !inString) return line.slice(0, i)
      }
      return line
    })
    .join("\n")
}

function parseScalar(raw) {
  const v = raw.trim()
  if (v === "true") return true
  if (v === "false") return false
  if (/^-?\d+$/.test(v)) return Number(v)
  if (/^".*"$/.test(v)) return v.slice(1, -1)
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim()
    if (inner === "") return []
    return inner.split(",").map((item) => parseScalar(item))
  }
  return v
}

/**
 * Deliberately narrow TOML reader: only the flat `[section]` + `key = value`
 * shapes our own controlled file uses. It is not a general TOML parser, and it
 * is not meant to be — a smaller surface is easier to reason about than a
 * dependency, and this file is the only input it ever sees.
 * Returns a flat map keyed by dotted path.
 *
 * @param {string} text
 * @returns {ConfigValues}
 */
export function parseConfigSubset(text) {
  /** @type {ConfigValues} */
  const values = {}
  let section = ""

  for (const rawLine of stripComments(text).split("\n")) {
    const line = rawLine.trim()
    if (line === "") continue

    const sectionMatch = /^\[([A-Za-z0-9_.]+)\]$/.exec(line)
    if (sectionMatch) {
      section = sectionMatch[1]
      continue
    }

    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z0-9_]+$/.test(key)) continue

    values[section ? `${section}.${key}` : key] = parseScalar(line.slice(eq + 1))
  }

  return values
}

// ─── validation ──────────────────────────────────────────────────────────────

/**
 * Pure config gate. Returns { ok, failures } and never throws, so callers can
 * report every problem at once instead of only the first.
 *
 * Note: every check reads PARSED VALUES, not raw text. The config's own
 * comments mention "brain-dump" and the default ports on purpose; matching
 * against raw text would flag that prose and make the guard cry wolf.
 */
export function validateConfig(values) {
  const failures = []

  for (const [key, expected] of Object.entries(REQUIRED_CONFIG)) {
    if (!(key in values)) {
      failures.push(`missing required key: ${key}`)
      continue
    }
    if (values[key] !== expected) {
      failures.push(
        `${key} must be ${JSON.stringify(expected)}, found ${JSON.stringify(values[key])}`
      )
    }
  }

  if (values.project_id === BRAIN_DUMP_PROJECT_ID) {
    failures.push(`project_id targets the other local stack (${BRAIN_DUMP_PROJECT_ID})`)
  }

  for (const [key, value] of Object.entries(values)) {
    if (!key.endsWith("port")) continue
    if (BRAIN_DUMP_PORTS.includes(value)) {
      failures.push(`${key} = ${value} collides with the other local stack`)
    }
  }

  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "string") continue
    if (value.includes(PRODUCTION_REF)) failures.push(`${key} references the production project`)
    if (value.includes(REMOTE_HOST_MARKER)) failures.push(`${key} points at a remote Supabase host`)
  }

  return { ok: failures.length === 0, failures }
}

/**
 * Refuses to run while a production target is present in the environment.
 * Reports variable NAMES only — values are never read into the output.
 */
export function validateEnvironment(env) {
  const failures = []
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string") continue
    if (value.includes(PRODUCTION_REF)) failures.push(`${name} references the production project`)
    else if (value.includes(REMOTE_HOST_MARKER)) failures.push(`${name} points at a remote Supabase host`)
  }
  return { ok: failures.length === 0, failures }
}

/** Parses `docker ps` lines shaped as "name|ports" into structured entries. */
export function parseContainers(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", ports = ""] = line.split("|")
      const hostPorts = [...ports.matchAll(/:(\d+)->/g)].map((m) => Number(m[1]))
      return { name, hostPorts }
    })
}

/**
 * Reset is the one irreversible action, so it demands positive proof that the
 * BloomWise database container is the thing that will be reset: it must be
 * running AND publishing exactly our port. Without that the command could
 * otherwise find "some" local database.
 */
export function checkResetPreconditions(containers) {
  const db = containers.find((c) => c.name === DB_CONTAINER)
  if (!db) {
    return {
      ok: false,
      failures: [
        `${DB_CONTAINER} is not running — start the stack first; reset will not start it for you`,
      ],
    }
  }
  if (!db.hostPorts.includes(REQUIRED_CONFIG["db.port"])) {
    return {
      ok: false,
      failures: [
        `${DB_CONTAINER} does not publish ${REQUIRED_CONFIG["db.port"]} (found: ${db.hostPorts.join(", ") || "none"})`,
      ],
    }
  }
  return { ok: true, failures: [] }
}

/**
 * Before starting, any pre-existing container that claims one of our ports
 * must belong to this project. A foreign holder is a hard failure: picking a
 * different port automatically would defeat the whole isolation model.
 */
export function checkStartPreconditions(containers) {
  const ourPorts = Object.entries(REQUIRED_CONFIG)
    .filter(([key]) => key.endsWith("port"))
    .map(([, value]) => value)

  const failures = []
  for (const container of containers) {
    if (container.name.endsWith(CONTAINER_SUFFIX)) continue
    const clash = container.hostPorts.filter((p) => ourPorts.includes(p))
    if (clash.length > 0) {
      failures.push(
        `port ${clash.join(", ")} already held by foreign container ${container.name}`
      )
    }
  }
  return { ok: failures.length === 0, failures }
}

// ─── paths ───────────────────────────────────────────────────────────────────

/**
 * Resolved from this file's own location, never from user input — that is what
 * makes `--workdir ../brain-dump` impossible to express through this wrapper.
 */
export function resolvePaths(scriptUrl) {
  const scriptDir = path.dirname(fileURLToPath(scriptUrl))
  const repoRoot = path.resolve(scriptDir, "..")
  const workdir = path.join(repoRoot, "e2e")
  return { repoRoot, workdir, configPath: path.join(workdir, "supabase", "config.toml") }
}

// ─── cli ─────────────────────────────────────────────────────────────────────

const ACTIONS = ["check", "start", "reset", "stop"]

function fail(lines) {
  console.error("REFUSED — BloomWise E2E safety preflight\n")
  for (const line of lines) console.error(`  - ${line}`)
  process.exit(1)
}

function dockerPs(all) {
  const args = ["ps", ...(all ? ["-a"] : []), "--format", "{{.Names}}|{{.Ports}}"]
  const result = spawnSync("docker", args, { encoding: "utf8" })
  if (result.status !== 0) return null
  return parseContainers(result.stdout ?? "")
}

function runSupabase(workdir, args) {
  // Argument array + no shell: nothing here can be string-interpolated into a
  // command, and --workdir is always ours.
  const result = spawnSync("supabase", ["--workdir", workdir, ...args], {
    stdio: "inherit",
    encoding: "utf8",
  })
  process.exit(result.status ?? 1)
}

function main(argv) {
  const [action, ...rest] = argv
  if (!ACTIONS.includes(action)) {
    fail([`unknown action ${JSON.stringify(action ?? "")}; expected one of ${ACTIONS.join(", ")}`])
  }
  if (rest.length > 0) {
    // No pass-through arguments: a caller must not be able to append flags.
    fail([`unexpected extra arguments: ${rest.join(" ")}`])
  }

  const { workdir, configPath } = resolvePaths(import.meta.url)

  let raw
  try {
    raw = readFileSync(configPath, "utf8")
  } catch {
    fail([`cannot read config at ${configPath}`])
  }

  const values = parseConfigSubset(raw)
  const config = validateConfig(values)
  const env = validateEnvironment(process.env)
  if (!config.ok || !env.ok) fail([...config.failures, ...env.failures])

  const running = dockerPs(false)
  if (running === null) fail(["docker is not available or not running"])

  const brainDump = running.filter((c) => c.name.endsWith("_brain-dump"))
  const ours = running.filter((c) => c.name.endsWith(CONTAINER_SUFFIX))

  if (action === "check") {
    console.log("BloomWise E2E config: SAFE")
    console.log(`  project:            ${values.project_id}`)
    console.log(`  workdir:            ${workdir}`)
    console.log(`  DB target:          127.0.0.1:${values["db.port"]}`)
    console.log(`  API target:         127.0.0.1:${values["api.port"]}`)
    console.log(
      `  other stack:        ${brainDump.length > 0 ? `detected (${brainDump.length} containers, untouched)` : "not detected"}`
    )
    console.log(
      `  BloomWise stack:    ${ours.length > 0 ? `running (${ours.length} containers)` : "not running"}`
    )
    return
  }

  if (action === "start") {
    const pre = checkStartPreconditions(running)
    if (!pre.ok) fail(pre.failures)
    runSupabase(workdir, ["start"])
  }

  if (action === "reset") {
    const pre = checkResetPreconditions(running)
    if (!pre.ok) fail(pre.failures)
    runSupabase(workdir, ["db", "reset"])
  }

  if (action === "stop") {
    // Always through the CLI — this wrapper never manipulates containers itself.
    runSupabase(workdir, ["stop"])
  }
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (invokedDirectly) main(process.argv.slice(2))
