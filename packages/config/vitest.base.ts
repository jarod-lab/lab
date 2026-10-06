import { defineConfig } from "vitest/config"

// Ratchet: thresholds only go up. Raise them when coverage improves.
export const baseConfig = (
  thresholds = { lines: 80, functions: 80, branches: 70, statements: 80 },
) =>
  defineConfig({
    test: {
      // PGlite boots a WASM Postgres and applies migrations; that is slow on a cold CI runner.
      testTimeout: 30_000,
      hookTimeout: 60_000,
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.*",
          "src/**/*.stories.*",
          "src/**/*.types.ts",
          "src/auth-schema.ts",
        ],
        reporter: ["text-summary", "lcov"],
        thresholds,
      },
    },
  })
