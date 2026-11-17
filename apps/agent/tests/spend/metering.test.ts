import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, test } from "vitest"

/**
 * eve emits no `usage.recorded` for a decision-model call (`decide()` works outside any session), so
 * every decision call must go through `meteredDecide` (`agent/lib/spend/ledger.ts`), which adds the
 * cost to the turn or records it as build spend. This holds that line: nothing but the ledger may
 * import the real `decide`, and the three call sites (triage, CI diagnosis, pretriage) use the
 * metered one.
 */
const AGENT = join(import.meta.dirname, "../../agent")

const sources = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) {
      return sources(path)
    }
    return path.endsWith(".ts") ? [path] : []
  })

const importsDecideValue = (text: string) =>
  /^import \{[^}]*\bdecide\b[^}]*\} from "eve\/ai"/m.test(text)

describe("decision-model spend is metered", () => {
  test("only the ledger imports the real decide() as a value", () => {
    const importers = sources(AGENT)
      .filter((path) => importsDecideValue(readFileSync(path, "utf8")))
      .map((path) => relative(AGENT, path))
    expect(importers).toEqual(["lib/spend/ledger.ts"])
  })

  test.each([
    ["tools/triage_work_item.ts", "meteredDecide()"],
    ["tools/diagnose_ci_failure.ts", "meteredDecide()"],
    ["instructions/pretriage.ts", "meteredDecide({ build: true })"],
  ])("%s calls decide through %s", (file, call) => {
    expect(readFileSync(join(AGENT, file), "utf8")).toContain(call)
  })
})
