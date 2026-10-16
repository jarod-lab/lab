import type { E2EConfig } from "e2e"
import { web } from "@e2e-dev/web"
import { gateway } from "ai"

// Port 0: the runner picks a free port and passes it to vite as {port}, so runs never clash. A
// running `pnpm dev` (portless, https) is not reused; portless serves https://web.starter.localhost
// and the runner needs plain http on its own port.
// One dev server for every target: targets that declare the same app.command share one process.
// The web app (apps/web, Vite) serves the SPA; the API is needed only by flows that call it, and
// `pnpm dev` (portless) gives the same app at https://web.starter.localhost instead.
const app = {
  url: "http://127.0.0.1:0",
  command: {
    executable: "pnpm",
    args: [
      "--filter",
      "@starter/web",
      "exec",
      "vite",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      "{port}",
      "--strictPort",
    ],
    log: ".e2e/logs/app.log",
  },
}

export default {
  tests: "e2e/**/*.e2e.ts",
  targets: [
    { name: "desktop", engine: web(), app },
    { name: "phone", engine: web({ viewport: { width: 390, height: 844 } }), app },
  ],
  // The model behind agent.* steps. The smoke test uses none, so it runs without a key.
  // gateway() reads AI_GATEWAY_API_KEY from the runner's own environment (not packages/env).
  agents: {
    default: {
      model: gateway("openai/gpt-6-luna-fast"),
      system: "You are a thorough QA agent. Verify every outcome on screen.",
    },
  },
} satisfies E2EConfig
