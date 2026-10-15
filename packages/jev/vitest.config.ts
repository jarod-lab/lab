import { baseConfig } from "@starter/config/vitest.base"
import { mergeConfig } from "vitest/config"

// The package is a stub with no source yet; drop passWithNoTests once it has tests.
export default mergeConfig(baseConfig(), { test: { passWithNoTests: true } })
