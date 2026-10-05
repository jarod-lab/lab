import { defineConfig } from "vitest/config"

// Ratchet: thresholds only go up. Raise them when coverage improves.
export const baseConfig = (
  thresholds = { lines: 80, functions: 80, branches: 70, statements: 80 },
) =>
  defineConfig({
    test: {
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.*", "src/**/*.stories.*"],
        reporter: ["text-summary", "lcov"],
        thresholds,
      },
    },
  })
