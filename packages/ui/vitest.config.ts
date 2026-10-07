import { baseConfig } from "@starter/config/vitest.base"

// src/components is vendored shadcn code, demos and their shims (see AGENTS.md), and src/hooks is a
// vendored hook. They are smoke-tested (all.test.tsx, examples.test.tsx), not held to thresholds.
export default baseConfig(undefined, ["src/components/**", "src/hooks/**"])
