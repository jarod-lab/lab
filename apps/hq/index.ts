// The Vercel entry (zero-config Hono): the file Vercel finds, because it sits at the project root,
// where the search starts, and imports "hono". It must stay at the root: src/app.ts also imports
// hono and would be found first if this were src/index.ts. `export default` is the app Vercel
// serves; `serve()` is not used here.
//
// Importing this file boots nothing. The first request runs `bootVercel` (src/boot-hq.ts: the same
// `bootHq` server.ts runs, always as a deployed hq) once per instance, and a boot that refuses
// answers every request 503. The boot is a dynamic import so that a bad environment is that 503 and not a crash at load.
import type { Hono } from "hono"

import { createLazyHq } from "./src/lazy-hq"

const app: Hono = createLazyHq(async () =>
  (await import("./src/boot-hq")).bootVercel().then((b) => b.app),
)

export default app
