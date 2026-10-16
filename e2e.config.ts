import type { E2EConfig } from "e2e"
import { web } from "@e2e-dev/web"
import { gateway } from "ai"

// Port 0: the runner picks a free port and passes it to the stack as {port}, so runs never clash. A
// running `pnpm dev` (portless, https) is not reused; portless serves https://web.starter.localhost
// and the runner needs plain http on its own port.
// One app process for every target: targets that declare the same app.command share it.
// The app is the web dev server (apps/web, Vite) and the API (apps/api), started by scripts/e2e-stack.mjs.
// The API needs Postgres with the migrations applied (DATABASE_URL, from the runner's environment or
// .env). The journeys sign up, so they need the dev mail sink (DEV_MAIL_SINK) as well.
const apiPort = process.env.E2E_API_PORT ?? "4310"

// Only what the stack needs is passed on: the child inherits nothing else from the runner.
const stackEnv: Record<string, string> = {
  E2E_API_PORT: apiPort,
  DEV_MAIL_SINK: "true",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "noreply@example.com",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
}
for (const [key, value] of Object.entries(stackEnv)) if (value === "") delete stackEnv[key]

const app = {
  url: "http://127.0.0.1:0",
  command: {
    executable: "node",
    args: ["scripts/e2e-stack.mjs", "{port}"],
    env: stackEnv,
    log: ".e2e/logs/app.log",
    startupTimeout: 120_000,
  },
}

export default {
  tests: "e2e/**/*.e2e.ts",
  targets: [
    { name: "desktop", engine: web(), app },
    { name: "phone", engine: web({ viewport: { width: 390, height: 844 } }), app },
  ],
  // The model behind agent.* steps. The smoke and app-shell tests use none, so they run without a key.
  // gateway() reads AI_GATEWAY_API_KEY from the runner's own environment (not packages/env).
  agents: {
    default: {
      model: gateway("openai/gpt-6-luna-fast"),
      system: "You are a thorough QA agent. Verify every outcome on screen.",
    },
  },
} satisfies E2EConfig
