import { vi } from "vitest"

/** One request the product client sent, read back for assertions. */
export interface Sent {
  method: string
  /** The path, without the origin. */
  path: string
  /** The query string, with its leading "?", or "". */
  search: string
  organization: string | null
  body: unknown
  credentials: RequestCredentials
}

/**
 * A fetch stub for the product client: it records each request as a Sent and answers with `reply`.
 * It takes fetch's own parameters, so the API factories accept it as `typeof fetch` without a cast.
 */
export function productFetch(reply: (sent: Sent, index: number) => Response | Promise<Response>) {
  const sent: Sent[] = []
  const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)
    const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.text()
    const entry: Sent = {
      method: request.method,
      path: url.pathname,
      search: url.search,
      organization: request.headers.get("X-Organization-Id"),
      body: text ? JSON.parse(text) : undefined,
      credentials: request.credentials,
    }
    sent.push(entry)
    return reply(entry, sent.length - 1)
  })
  return { fetchImpl, sent }
}

export function json(body: unknown, init: { status?: number; date?: string } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.date ? { date: init.date } : {}),
    },
  })
}
