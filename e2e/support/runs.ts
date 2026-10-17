import type { App } from "e2e"

// Seeds a run that needs a decision, through the public API with an API key, the way an agent would
// (scripts/seed-demo-run.mjs does the same calls). The key is made here from the owner's session, with
// the permissions an agent needs; nothing bypasses the server's checks. Not a test file.

export interface SeededRun {
  runId: string
  approvalId: string
}

/** Every cookie the response sets, as one Cookie header for the next request. */
function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ")
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`seed failed: ${response.status} ${await response.text()}`)
  return (await response.json()) as T
}

/**
 * Signs the owner in over the API, makes the organization their active one, creates an agent key with
 * agent and run permissions, and drives a run to "needs you" (one step done, one approval asked).
 */
export async function seedNeedsYouRun(
  app: App,
  {
    email,
    password,
    slug,
    title,
    action,
  }: {
    email: string
    password: string
    slug: string
    title: string
    action: string
  },
): Promise<SeededRun> {
  if (!app.baseUrl) throw new Error("the app has no base URL")
  const base = app.baseUrl
  const origin = { origin: base, "content-type": "application/json" }

  const signIn = await fetch(new URL("/api/auth/sign-in/email", base), {
    method: "POST",
    headers: origin,
    body: JSON.stringify({ email, password }),
  })
  const cookie = cookieHeader(signIn)
  if (signIn.status !== 200) throw new Error(`sign-in failed: ${signIn.status}`)

  const organizations = await json<{ id: string; slug: string }[]>(
    await fetch(new URL("/api/auth/organization/list", base), {
      headers: { cookie, origin: base },
    }),
  )
  const organization = organizations.find((org) => org.slug === slug)
  if (!organization) throw new Error(`no organization ${slug} for ${email}`)
  await json(
    await fetch(new URL("/api/auth/organization/set-active", base), {
      method: "POST",
      headers: { ...origin, cookie },
      body: JSON.stringify({ organizationId: organization.id }),
    }),
  )

  const key = await json<{ key: string }>(
    await fetch(new URL("/v1/api-keys", base), {
      method: "POST",
      headers: { ...origin, cookie, "x-organization-id": organization.id },
      body: JSON.stringify({
        name: `e2e seed ${Date.now().toString(36)}`,
        permissions: { agent: ["create"], run: ["create", "update"] },
      }),
    }),
  )

  const agentCall = (method: string, path: string, body?: unknown) =>
    fetch(new URL(path, base), {
      method,
      headers: { authorization: `Bearer ${key.key}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  const agent = await json<{ id: string }>(
    await agentCall("POST", "/v1/workspace-agents", { name: `${title} agent` }),
  )
  const run = await json<{ id: string }>(
    await agentCall("POST", `/v1/workspace-agents/${agent.id}/runs`, { title }),
  )
  await json(
    await agentCall("PATCH", `/v1/runs/${run.id}`, {
      status: "running",
      energyWh: 0.6,
      tokens: 18_000,
      toolCalls: 7,
    }),
  )
  await json(
    await agentCall("POST", `/v1/runs/${run.id}/steps`, {
      kind: "collect",
      title: "Collected 14 release blockers",
      status: "done",
    }),
  )
  const approval = await json<{ id: string }>(
    await agentCall("POST", `/v1/runs/${run.id}/approvals`, {
      action,
      detail: "v2.8 triage: 4 themes, 2 fixes drafted.",
    }),
  )
  return { runId: run.id, approvalId: approval.id }
}
