import { type AnyOperation, formatPermissions } from "./operation"
import { type ApiInfo, inputSchema, outputSchema } from "./openapi"

export interface DocsLinks {
  /** Extra links for the llms.txt "Docs" section, e.g. a quickstart or the agent skill. */
  docs?: { title: string; url: string; note?: string }[]
}

const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``

function curl(op: AnyOperation, baseURL: string): string {
  const input = (op.examples?.[0]?.input ?? {}) as Record<string, unknown>
  let path = op.path
  const rest: Record<string, unknown> = { ...input }
  for (const [k, v] of Object.entries(input)) {
    if (path.includes(`:${k}`)) {
      path = path.replace(`:${k}`, encodeURIComponent(String(v)))
      delete rest[k]
    }
  }
  const lines = [`curl -X ${op.method} "${baseURL}${path}`]
  if (op.method === "GET" || op.method === "DELETE") {
    const qs = new URLSearchParams(Object.entries(rest).map(([k, v]) => [k, String(v)])).toString()
    lines[0] += qs ? `?${qs}"` : `"`
  } else lines[0] += `"`
  lines.push(`  -H "x-api-key: $API_KEY"`)
  if (op.method !== "GET" && op.method !== "DELETE") {
    lines.push(`  -H "content-type: application/json"`, `  -d '${JSON.stringify(rest)}'`)
  }
  return lines.join(" \\\n")
}

function intro(info: ApiInfo): string[] {
  return [
    `# ${info.title}`,
    "",
    `> ${info.description}`,
    "",
    "Authenticate with an organization API key (`x-api-key: sk_...` or `Authorization: Bearer sk_...`) " +
      "or an OAuth access token. Every request acts in one organization, with the key's permissions, " +
      "or the user's role narrowed by the token's scopes. " +
      'Errors are JSON: `{ "error": { "code", "message" } }`.',
    "",
  ]
}

/** llms.txt (https://llmstxt.org): an index agents read first. Serve it at /llms.txt. */
export function llmsTxt(ops: readonly AnyOperation[], info: ApiInfo, links: DocsLinks = {}) {
  const lines = [
    ...intro(info),
    "## Docs",
    "",
    `- [Full reference](${info.baseURL}/llms-full.txt): every operation with schemas and examples`,
    `- [OpenAPI](${info.baseURL}/openapi.json): OpenAPI 3.1 spec`,
    `- [MCP server](${info.baseURL}/mcp): Streamable HTTP; same operations as tools, OAuth sign-in`,
    ...(links.docs ?? []).map((d) => `- [${d.title}](${d.url})${d.note ? `: ${d.note}` : ""}`),
    "",
    "## Operations",
    "",
    ...ops.map((op) => `- \`${op.method} ${op.path}\` (\`${op.name}\`): ${op.summary}`),
    "",
  ]
  return lines.join("\n")
}

/** Every operation in full, as one Markdown file. Serve it at /llms-full.txt. */
export function llmsFullTxt(ops: readonly AnyOperation[], info: ApiInfo) {
  const sections = ops.map((op) => {
    const example = op.examples?.[0]
    return [
      `## ${op.name}`,
      "",
      `\`${op.method} ${op.path}\`. ${op.summary}`,
      "",
      op.description,
      "",
      `Permissions: ${formatPermissions(op.permissions) || "none (any authenticated caller)"}`,
      "",
      "Input:",
      "",
      fence("json", JSON.stringify(inputSchema(op), null, 2)),
      "",
      "Output:",
      "",
      fence("json", JSON.stringify(outputSchema(op), null, 2)),
      "",
      ...(example
        ? [
            "Example:",
            "",
            fence("sh", curl(op, info.baseURL)),
            ...(example.output ? ["", fence("json", JSON.stringify(example.output, null, 2))] : []),
            ...(example.error ? ["", `Fails with \`${example.error}\`.`] : []),
            "",
          ]
        : []),
    ].join("\n")
  })
  return [...intro(info), ...sections].join("\n")
}
