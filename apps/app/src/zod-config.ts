import { z } from "zod"

// Zod probes `new Function` on its first object parse; apps/api's CSP has no 'unsafe-eval', so the
// browser reports a violation on every page even though Zod catches the error. Jitless skips the probe.
// router.tsx imports this module first, so it runs before any other module can parse.
z.config({ jitless: true })
