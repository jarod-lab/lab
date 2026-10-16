// Drives a demo run to "needs you" through the public API, as a real agent would: create an agent,
// start a run, report it running, add a finished step, and ask for an approval. The e2e tests then
// approve or deny that approval in the web app. It only uses the API, with an API key, so it can't
// skip the permission checks.
//
// Usage: pnpm exec tsx scripts/seed-demo-run.mjs <api-url> <api-key>
// The key needs agent:create and run:create, run:update (see apps/api/src/runs.test.ts for shapes).
import { createClient } from "../packages/sdk/src/index.ts"

const [baseURL, apiKey] = process.argv.slice(2)
if (!baseURL || !apiKey) {
  process.stderr.write("usage: tsx scripts/seed-demo-run.mjs <api-url> <api-key>\n")
  process.exit(2)
}

const client = createClient({ baseURL, apiKey })
const stamp = new Date().toISOString().slice(11, 19)

const agent = await client.request("POST", "/v1/workspace-agents", {
  body: { name: `Release triage (demo ${stamp})`, description: "Seeded for e2e" },
})
const run = await client.request("POST", "/v1/workspace-agents/{id}/runs", {
  path: { id: agent.id },
  body: { title: "v2.8 triage" },
})
await client.request("PATCH", "/v1/runs/{id}", {
  path: { id: run.id },
  body: { status: "running", energyWh: 0.6, tokens: 18000, toolCalls: 7 },
})
await client.request("POST", "/v1/runs/{id}/steps", {
  path: { id: run.id },
  body: { kind: "collect", title: "Collected 14 release blockers", status: "done" },
})
const approval = await client.request("POST", "/v1/runs/{id}/approvals", {
  path: { id: run.id },
  body: {
    action: "Post summary to #releases",
    detail: "v2.8 triage: 4 themes, 2 fixes drafted. Blockers: auth redirect loop (fix ready).",
  },
})

process.stdout.write(
  `${JSON.stringify({ agentId: agent.id, runId: run.id, approvalId: approval.id }, null, 2)}\n`,
)
