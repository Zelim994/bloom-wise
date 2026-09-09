// Regression suite for the E2E Supabase safety preflight.
//
// The guard's whole job is to refuse. These tests therefore focus on the
// refusals: each one mutates a single value in an otherwise-valid config and
// asserts the guard still says no. A guard that silently accepts a wrong port
// is worse than no guard, because it would be trusted before a `db reset`.
//
// Pure logic only — no Docker, no database, no spawning, no filesystem.

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  BRAIN_DUMP_PROJECT_ID,
  DB_CONTAINER,
  PRODUCTION_REF,
  checkResetPreconditions,
  checkStartPreconditions,
  parseConfigSubset,
  parseContainers,
  resolvePaths,
  stripComments,
  validateConfig,
  validateEnvironment,
} from "./e2e-supabase.mjs"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** The real committed config — the guard must accept exactly this. */
const REAL_CONFIG = readFileSync(
  path.join(REPO_ROOT, "e2e", "supabase", "config.toml"),
  "utf8"
)

/** Minimal valid config, used as the base for single-value mutations. */
const VALID = `
project_id = "bloomwise-e2e"
[api]
port = 54421
[db]
port = 54422
shadow_port = 54420
[db.pooler]
port = 54429
[db.seed]
enabled = false
[studio]
port = 54423
[local_smtp]
port = 54424
[analytics]
port = 54427
[auth]
site_url = "http://127.0.0.1:3100"
[storage]
enabled = true
`

function validateSource(source: string) {
  return validateConfig(parseConfigSubset(source))
}

describe("preflight — accepts the real config", () => {
  it("passes on the committed e2e/supabase/config.toml", () => {
    const result = validateSource(REAL_CONFIG)
    expect(result.failures).toEqual([])
    expect(result.ok).toBe(true)
  })

  it("passes on the minimal valid fixture", () => {
    expect(validateSource(VALID).ok).toBe(true)
  })

  it("reads values without rewriting them", () => {
    // The guard must be a pure reader: a valid config comes back unmodified.
    const values = parseConfigSubset(VALID)
    expect(values.project_id).toBe("bloomwise-e2e")
    expect(values["db.port"]).toBe(54422)
    expect(values["storage.enabled"]).toBe(true)
    expect(values["db.seed.enabled"]).toBe(false)
    expect(values["auth.site_url"]).toBe("http://127.0.0.1:3100")
  })
})

describe("preflight — refuses the other local stack", () => {
  it("refuses project_id brain-dump", () => {
    const result = validateSource(
      VALID.replace('project_id = "bloomwise-e2e"', `project_id = "${BRAIN_DUMP_PROJECT_ID}"`)
    )
    expect(result.ok).toBe(false)
    expect(result.failures.join(" ")).toContain(BRAIN_DUMP_PROJECT_ID)
  })

  it("refuses the other stack's DB port 54322", () => {
    const result = validateSource(VALID.replace("port = 54422", "port = 54322"))
    expect(result.ok).toBe(false)
    expect(result.failures.join(" ")).toContain("54322")
  })

  it("refuses the other stack's API port 54321", () => {
    const result = validateSource(VALID.replace("port = 54421", "port = 54321"))
    expect(result.ok).toBe(false)
    expect(result.failures.join(" ")).toContain("54321")
  })
})

describe("preflight — refuses remote targets", () => {
  it("refuses a production project ref in the config", () => {
    const result = validateSource(
      VALID.replace(
        'site_url = "http://127.0.0.1:3100"',
        `site_url = "https://${PRODUCTION_REF}.example"`
      )
    )
    expect(result.ok).toBe(false)
  })

  it("refuses a remote supabase.co host in the config", () => {
    const result = validateSource(
      VALID.replace(
        'site_url = "http://127.0.0.1:3100"',
        'site_url = "https://anything.supabase.co"'
      )
    )
    expect(result.ok).toBe(false)
  })

  it("refuses a production ref present in the environment, naming only the variable", () => {
    const result = validateEnvironment({
      SOME_URL: `https://${PRODUCTION_REF}.supabase.co`,
    })
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain("SOME_URL")
    // The value itself must never be echoed back.
    expect(result.failures.join(" ")).not.toContain(PRODUCTION_REF)
  })

  it("accepts an environment with no remote targets", () => {
    expect(validateEnvironment({ PATH: "/usr/bin", NODE_ENV: "test" }).ok).toBe(true)
  })
})

describe("preflight — refuses incomplete config", () => {
  it("refuses when project_id is missing", () => {
    const result = validateSource(VALID.replace('project_id = "bloomwise-e2e"', ""))
    expect(result.ok).toBe(false)
    expect(result.failures.join(" ")).toContain("project_id")
  })

  it("refuses when the DB port is missing", () => {
    // A missing port is the dangerous case: the CLI would fall back to the
    // default 54322, which is the other project's database.
    const result = validateSource(VALID.replace("port = 54422\n", ""))
    expect(result.ok).toBe(false)
    expect(result.failures.join(" ")).toContain("db.port")
  })

  it("refuses an empty config outright", () => {
    expect(validateSource("").ok).toBe(false)
  })

  it("refuses when seed or storage flags are flipped", () => {
    expect(validateSource(VALID.replace("enabled = false", "enabled = true")).ok).toBe(false)
    expect(validateSource(VALID.replace("enabled = true", "enabled = false")).ok).toBe(false)
  })
})

describe("preflight — comments cannot influence the verdict", () => {
  it("ignores prose mentioning the other stack and its ports", () => {
    // The real config documents brain-dump and 54322 in comments on purpose.
    // Matching raw text would make the guard fail on its own documentation.
    const commented = `# brain-dump uses 54322 and 54321\n${VALID}`
    expect(validateSource(commented).ok).toBe(true)
  })

  it("keeps a # that appears inside a quoted value", () => {
    expect(stripComments('site_url = "http://x/#frag" # trailing').trim()).toBe(
      'site_url = "http://x/#frag"'
    )
  })
})

describe("workdir guard", () => {
  it("derives the workdir from the script location, not from input", () => {
    const { repoRoot, workdir, configPath } = resolvePaths(
      new URL("file:///repo/scripts/e2e-supabase.mjs").href
    )
    expect(repoRoot).toBe(path.resolve("/repo"))
    expect(workdir).toBe(path.resolve("/repo/e2e"))
    expect(configPath).toBe(path.resolve("/repo/e2e/supabase/config.toml"))
  })

  it("resolves to this repository's own e2e directory", () => {
    const { workdir } = resolvePaths(import.meta.url)
    expect(workdir).toBe(path.join(REPO_ROOT, "e2e"))
  })
})

describe("reset preconditions", () => {
  it("refuses when the BloomWise database container is not running", () => {
    const containers = parseContainers("supabase_db_brain-dump|0.0.0.0:54322->5432/tcp")
    const result = checkResetPreconditions(containers)
    expect(result.ok).toBe(false)
    expect(result.failures.join(" ")).toContain(DB_CONTAINER)
  })

  it("refuses when our container does not publish the expected port", () => {
    const containers = parseContainers(`${DB_CONTAINER}|0.0.0.0:54322->5432/tcp`)
    expect(checkResetPreconditions(containers).ok).toBe(false)
  })

  it("allows only when our container publishes exactly 54422", () => {
    const containers = parseContainers(`${DB_CONTAINER}|0.0.0.0:54422->5432/tcp`)
    expect(checkResetPreconditions(containers).ok).toBe(true)
  })
})

describe("start preconditions", () => {
  it("refuses when a foreign container already holds one of our ports", () => {
    const containers = parseContainers("supabase_db_brain-dump|0.0.0.0:54422->5432/tcp")
    const result = checkStartPreconditions(containers)
    expect(result.ok).toBe(false)
    expect(result.failures.join(" ")).toContain("brain-dump")
  })

  it("ignores the other stack while it stays on its own ports", () => {
    const containers = parseContainers(
      "supabase_db_brain-dump|0.0.0.0:54322->5432/tcp\nsupabase_kong_brain-dump|0.0.0.0:54321->8000/tcp"
    )
    expect(checkStartPreconditions(containers).ok).toBe(true)
  })

  it("accepts our own containers holding our own ports", () => {
    const containers = parseContainers(`${DB_CONTAINER}|0.0.0.0:54422->5432/tcp`)
    expect(checkStartPreconditions(containers).ok).toBe(true)
  })
})
