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
 * A fetch stub for the product client: it records each request as a Sent (the client passes a
 * Request) and answers with `reply`. `fetchImpl` is cast to typeof fetch for the API factories.
 */
export function productFetch(reply: (sent: Sent, index: number) => Response | Promise<Response>) {
  const sent: Sent[] = []
  const fetchImpl = vi.fn(async (input: Request) => {
    const url = new URL(input.url)
    const text = input.method === "GET" || input.method === "HEAD" ? "" : await input.text()
    const entry: Sent = {
      method: input.method,
      path: url.pathname,
      search: url.search,
      organization: input.headers.get("X-Organization-Id"),
      body: text ? JSON.parse(text) : undefined,
      credentials: input.credentials,
    }
    sent.push(entry)
    return reply(entry, sent.length - 1)
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, sent }
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
