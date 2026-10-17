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
// Only what the stack needs is passed on: the child inherits nothing else from the runner.
const stackEnv: Record<string, string> = {
  // Unset: each stack picks a free API port (desktop and phone run side by side).
  E2E_API_PORT: process.env.E2E_API_PORT ?? "",
  // The mail sink runs only under NODE_ENV development or test (packages/env refuses it otherwise).
  NODE_ENV: "development",
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

// The admin journey (e2e/admin.e2e.ts) signs in as a platform admin. Promotion is DB-only, so the account
// is made outside the suite (see e2e/README.md). The password is a function: a string from an unset
// variable would fail every command here, `e2e list` included. Override per run with E2E_USER_ADMIN_*.
const credentials = {
  admin: {
    username: process.env.E2E_ADMIN_EMAIL || "admin@example.test",
    password: () => process.env.E2E_ADMIN_PASSWORD ?? "",
  },
}

export default {
  credentials,
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
