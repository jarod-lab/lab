// Type-level tests: checked by `pnpm typecheck`, not run by Vitest.
import { createLogger } from "@starter/logger"
import { observe } from "./index"

const logger = createLogger()

// A Next App Router-shaped handler keeps its route argument, and callers must supply it.
const GET = observe(
  (_req, { requestId }, route: { params: Promise<{ id: string }> }) =>
    new Response(`${requestId}:${typeof route.params}`),
  { logger },
)

GET(new Request("http://localhost"), { params: Promise.resolve({ id: "1" }) })

// @ts-expect-error the route argument is required
GET(new Request("http://localhost"))

// @ts-expect-error the route argument has the wrong shape
GET(new Request("http://localhost"), { params: { id: "1" } })

// A handler with no extra arguments is called with just the request.
const plain = observe(() => new Response("ok"), { logger })
plain(new Request("http://localhost"))

// @ts-expect-error no extra arguments expected
plain(new Request("http://localhost"), {})
