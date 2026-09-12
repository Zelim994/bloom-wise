import { defineConfig } from "vitest/config"

// Local-database integration suite.
//
// Deliberately a SEPARATE config with an explicit include: the repo has no
// root vitest config, so Vitest's default `**/*.{test,spec}.*` glob would
// otherwise collect these files during `npm test` and fail in CI, which has no
// PostgreSQL. The `.dbtest.ts` suffix keeps them invisible to that default.
export default defineConfig({
  test: {
    include: ["e2e/integration/**/*.dbtest.ts"],
    // The suite owns real DB sessions and a deliberate lock-contention
    // scenario; running files or cases in parallel would make blocking
    // observations ambiguous.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
