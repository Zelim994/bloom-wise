import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Minimal config with exactly one purpose: teach Vitest the "@/" path alias
// that tsconfig.json already defines. Production modules import each other
// through it (e.g. lib/inventory/status.ts imports "@/lib/inventory/aging"),
// and Vitest cannot resolve that on its own. Everything else — test discovery,
// environment, reporters — stays on Vitest defaults on purpose.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL("./", import.meta.url)),
      },
    ],
  },
})
