import type { ApiInfo } from "./openapi"
import type { AnyOperation } from "./operation"

/**
 * The MCP server's `instructions`: what a client shows its model about this server, before any tool
 * is called. Built from the same ApiInfo and operation list as the tools, so it can't drift from them.
 * Operations that are not MCP tools (`auth: "none"`, `auth: "person"`, `audience: "operator"`) are left
 * out, as the tool list leaves them out. Kept short: the full reference is one link away.
 */
export function serverInstructions(
  info: ApiInfo,
  operations: readonly AnyOperation[],
  options: { skill?: boolean } = {},
): string {
  const tools = operations.filter(
    (op) => op.auth !== "none" && op.auth !== "person" && op.audience !== "operator",
  )
  const names = new Set(tools.map((op) => op.name))
  const writes = tools.filter((op) => op.hints?.readOnly !== true)
  const destructive = tools.filter((op) => op.hints?.destructive === true)

  const lines = [
    `${info.title}: ${info.description}`,
    "",
    "Every credential acts in one organization. Tools you can't see, or a FORBIDDEN error, mean the",
    "credential lacks that permission; the error's hint names the OAuth scope or API key permission that",
    "would allow it. Ask the person for that one.",
  ]
  if (writes.length > 0) {
    lines.push(
      "",
      "Pass a unique `idempotencyKey` on every write (a new action gets a new key; a retry reuses the key).",
    )
  }
  if (destructive.length > 0) {
    // Names, up to a few: the full list is in llms.txt and each tool's annotations.
    const shown = destructive.slice(0, 5).map((op) => op.name)
    const more = destructive.length - shown.length
    lines.push(
      "",
      `Confirm with the person before calling the destructive tools (${shown.join(", ")}${more > 0 ? `, and ${more} more` : ""}).`,
    )
  }
  if (names.has("request_approval") && names.has("get_run")) {
    lines.push(
      "",
      "Before any action a person must allow, call `request_approval` with the exact action and wait:",
      "take the action only once `get_run` shows the approval as approved. A denied approval is not taken.",
    )
  }
  lines.push(
    "",
    `Full reference: ${info.baseURL}/llms-full.txt${options.skill ? `. Agent guide: ${info.baseURL}/skill.md` : ""}`,
  )
  return lines.join("\n")
}
