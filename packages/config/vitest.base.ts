import { availableParallelism } from "node:os"

import { defineConfig } from "vitest/config"

// Ratchet: thresholds only go up. Raise them when coverage improves.
export const baseConfig = (
  thresholds = { lines: 80, functions: 80, branches: 70, statements: 80 },
  extraExclude: string[] = [],
) =>
  defineConfig({
    test: {
      // PGlite boots a WASM Postgres and applies migrations; that is slow on a cold CI runner.
      testTimeout: 30_000,
      hookTimeout: 60_000,
      // turbo runs every package's tests at once, and vitest defaults to a worker per core in each:
      // dozens of PGlite instances on a few cores starve each other past the timeouts. A quarter
      // of the cores per package keeps the whole run busy without oversubscribing it.
      maxWorkers: Math.max(1, Math.floor(availableParallelism() / 4)),
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.*",
          "src/**/*.stories.*",
          "src/**/*.types.ts",
          "src/auth-schema.ts",
          ...extraExclude,
        ],
        reporter: ["text-summary", "lcov"],
        thresholds,
      },
    },
  })
