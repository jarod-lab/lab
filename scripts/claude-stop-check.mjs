// Claude Code Stop hook: an agent can't declare a turn done while the fast checks are red.
// Runs baseline (milliseconds) and typecheck (turbo-cached), prints the failures and exits 2 so the
// agent sees them and keeps going. Exits 0 when the hook already re-ran once this turn
// (stop_hook_active) so a check the agent can't fix doesn't loop forever. Wired in .claude/settings.json.
import { spawnSync } from "node:child_process"

let input = ""
for await (const chunk of process.stdin) input += chunk
let event = {}
try {
  event = JSON.parse(input)
} catch {
  // No JSON on stdin (run by hand): check anyway.
}
if (event.stop_hook_active) process.exit(0)

const checks = [
  ["baseline", ["exec", "baseline", "scan", ".", "--format", "compact"]],
  ["typecheck", ["turbo", "run", "typecheck", "--output-logs=errors-only"]],
]
const failures = []
for (const [name, args] of checks) {
  const result = spawnSync("pnpm", args, {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  })
  if (result.status !== 0) {
    const lines = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n")
    // baseline: errors and ratchets over their ceiling only; warnings never fail it.
    const kept =
      name === "baseline" ? lines.filter((l) => /error\[|OVER \(|errors,/.test(l)) : lines
    failures.push(`${name} failed:\n${kept.slice(-60).join("\n")}`)
  }
}
if (failures.length === 0) process.exit(0)
process.stderr.write(
  `${failures.join("\n\n")}\n\nFix these before finishing (never disable the rule).\n`,
)
process.exit(2)
