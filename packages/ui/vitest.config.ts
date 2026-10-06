import { baseConfig } from "@starter/config/vitest.base"

// components/ui and hooks are vendored shadcn code (see AGENTS.md): the components get a smoke
// test (all.test.tsx), but they are not held to coverage thresholds.
export default baseConfig(undefined, ["src/components/ui/**", "src/hooks/**"])
