// The e2e app: apps/api and the web dev server, started together by the runner (one `app.command`,
// one URL). The API runs on E2E_API_PORT; vite proxies /api, /v1, /mcp and /.well-known to it
// (API_URL), so the browser sees one origin and the session cookies apply. Both children stop when
// this process gets a signal or either one exits.
import { spawn } from "node:child_process"

const webPort = process.argv[2]
if (!webPort) throw new Error("usage: node scripts/e2e-stack.mjs <web port>")
const apiPort = process.env.E2E_API_PORT ?? "4310"
const apiUrl = `http://127.0.0.1:${apiPort}`

const children = []
const stop = () => {
  for (const child of children) child.kill("SIGTERM")
}
process.on("SIGINT", () => {
  stop()
  process.exit(130)
})
process.on("SIGTERM", () => {
  stop()
  process.exit(143)
})

function start(name, args, env) {
  const child = spawn("pnpm", args, { env, stdio: "inherit" })
  child.on("exit", (code) => {
    console.error(`[e2e stack] ${name} exited with ${code}`)
    stop()
    process.exit(code ?? 1)
  })
  children.push(child)
  return child
}

const env = {
  ...process.env,
  PORT: apiPort,
  BETTER_AUTH_URL: apiUrl,
  API_URL: apiUrl,
}

start("api", ["--filter", "@starter/api-app", "exec", "tsx", "src/server.ts"], env)

// The web app proxies to the API, and the first sign-up needs it: wait for its liveness check.
const deadline = Date.now() + 120_000
for (;;) {
  try {
    if ((await fetch(`${apiUrl}/health`)).ok) break
  } catch {
    // not listening yet
  }
  if (Date.now() > deadline) {
    console.error(`[e2e stack] the API did not answer on ${apiUrl}/health`)
    stop()
    process.exit(1)
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
}

start(
  "web",
  [
    "--filter",
    "@starter/web",
    "exec",
    "vite",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    webPort,
    "--strictPort",
  ],
  env,
)
