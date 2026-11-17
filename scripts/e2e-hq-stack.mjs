// The e2e hq app: apps/hq started by the runner on the port it picked, then one founder seeded.
// hq lets in only founders (HQ_FOUNDER_EMAILS) whose address is verified, and it has no dev mail sink
// to verify through, so, as scripts/e2e-stack.mjs does for the platform admin: sign the founder up
// through the API (an existing one answers 422 and keeps its password), then mark the address
// verified in the database. The child stops when this process gets a signal, and this process
// exits when the child does.
import { spawn } from "node:child_process"
import { createRequire } from "node:module"

const port = process.argv[2]
if (!port) throw new Error("usage: node scripts/e2e-hq-stack.mjs <port>")
const url = `http://127.0.0.1:${port}`
const email = process.env.E2E_HQ_FOUNDER_EMAIL
const password = process.env.E2E_HQ_FOUNDER_PASSWORD
const database = process.env.HQ_DATABASE_URL

const child = spawn("pnpm", ["--filter", "@lab/hq", "exec", "tsx", "src/server.ts", port], {
  env: process.env,
  stdio: "inherit",
})
child.on("exit", (code) => {
  console.error(`[e2e hq stack] hq exited with ${code}`)
  process.exit(code ?? 1)
})
const stop = (code) => {
  child.kill("SIGTERM")
  process.exit(code)
}
process.on("SIGINT", () => stop(130))
process.on("SIGTERM", () => stop(143))

const deadline = Date.now() + 120_000
for (;;) {
  try {
    if ((await fetch(`${url}/health`)).ok) break
  } catch {
    // not listening yet
  }
  if (Date.now() > deadline) {
    console.error(`[e2e hq stack] hq did not answer on ${url}/health`)
    stop(1)
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
}

if (email && password && database) {
  const signUp = await fetch(`${url}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ name: "E2E HQ Founder", email, password }),
  })
  if (!signUp.ok && signUp.status !== 422) {
    console.error(`[e2e hq stack] signing up ${email} failed: ${signUp.status}`)
    stop(1)
  }
  // postgres is packages/db's driver; the root workspace doesn't depend on it.
  const require = createRequire(new URL("../packages/db/package.json", import.meta.url))
  const { default: postgres } = await import(require.resolve("postgres"))
  const sql = postgres(database, { max: 1 })
  await sql`update "user" set email_verified = true where email = ${email}`
  await sql.end()
}
