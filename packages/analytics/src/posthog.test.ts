import { describe, expect, it, vi } from "vitest"

import type { CapturedEvent } from "./index"
import { createPostHogProvider } from "./posthog"

const at = new Date("2026-10-19T12:00:00Z")

function fakeFetch(status = 200) {
  return vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(new Response(null, { status })),
  )
}

/** The JSON body of the first request a fake fetch saw. */
function sent(fetch: ReturnType<typeof fakeFetch>): unknown {
  const init = fetch.mock.calls[0]?.[1]
  return JSON.parse(init?.body as string)
}

describe("createPostHogProvider", () => {
  it("posts a batch to /batch/ on the configured host", async () => {
    const fetch = fakeFetch()
    await createPostHogProvider({
      apiKey: "phc_test",
      host: "https://eu.i.posthog.com/",
      fetch,
    }).send([])
    expect(fetch.mock.calls[0]?.[0]).toBe("https://eu.i.posthog.com/batch/")
  })

  it("defaults to the US host", async () => {
    const fetch = fakeFetch()
    await createPostHogProvider({ apiKey: "phc_test", fetch }).send([])
    expect(fetch.mock.calls[0]?.[0]).toBe("https://us.i.posthog.com/batch/")
  })

  it("maps a person's operation call, grouped by organization", async () => {
    const fetch = fakeFetch()
    const event: CapturedEvent = {
      name: "operation.called",
      properties: { operation: "create_project", outcome: "ok", via: "session" },
      actor: { type: "user", userId: "u1" },
      organizationId: "org1",
      timestamp: at,
    }
    await createPostHogProvider({ apiKey: "phc_test", fetch }).send([event])
    expect(sent(fetch)).toEqual({
      api_key: "phc_test",
      batch: [
        {
          event: "operation.called",
          distinct_id: "u1",
          timestamp: "2026-10-19T12:00:00.000Z",
          properties: {
            operation: "create_project",
            outcome: "ok",
            via: "session",
            actor_type: "user",
            $groups: { organization: "org1" },
          },
        },
      ],
    })
  })

  it("sends page views as $pageview, and API keys under their own distinct id", async () => {
    const fetch = fakeFetch()
    await createPostHogProvider({ apiKey: "phc_test", fetch }).send([
      {
        name: "page.viewed",
        properties: { route: "/$org" },
        actor: { type: "apiKey", keyId: "k1" },
        timestamp: at,
      },
      { name: "auth.sign_in", actor: { type: "user", userId: "u1" }, timestamp: at },
    ])
    expect(sent(fetch)).toMatchObject({
      batch: [
        {
          event: "$pageview",
          distinct_id: "api_key:k1",
          properties: { $pathname: "/$org", actor_type: "apiKey" },
        },
        { event: "auth.sign_in", distinct_id: "u1", properties: { actor_type: "user" } },
      ],
    })
  })

  it("throws when PostHog refuses the batch", async () => {
    const provider = createPostHogProvider({ apiKey: "phc_test", fetch: fakeFetch(401) })
    await expect(provider.send([])).rejects.toMatchObject({
      code: "INTERNAL",
      context: { status: 401 },
    })
  })
})
