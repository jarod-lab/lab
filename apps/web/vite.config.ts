import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { type ProxyOptions, defineConfig } from "vite"

// SPA mode: the build prerenders one HTML shell and the client assets into `dist/` (index.html plus
// assets/, served by apps/api). The server bundle the plugin emits is never served, so it stays out.

// Dev only: the API (auth, REST, MCP, OAuth discovery) lives on its own origin, so the dev server
// forwards those paths to it and the session cookies and OAuth issuer match what the browser sees.
// API_URL is read here because this file runs in Node, not in the app (empty counts as unset, as
// .env.example leaves it). Under `pnpm dev`, portless serves this app as `app.<project>` and the API as
// `api.<project>` (portless.json), and gives both its CA. Otherwise it defaults to the port apps/api
// uses when no URL is set.
const portlessUrl = process.env.PORTLESS_URL
const portlessApi = portlessUrl?.replace("://app.", "://api.")
const apiTarget = process.env.API_URL || portlessApi || "http://localhost:3000"

const apiProxy: ProxyOptions = {
  target: apiTarget,
  changeOrigin: true,
  configure: (proxy) => {
    // better-auth checks the Origin header against the API's own base URL, and the browser sends
    // the dev server's origin. Rewrite it to the API's so the forwarded request is same-origin.
    proxy.on("proxyReq", (proxyReq) => {
      if (proxyReq.getHeader("origin")) proxyReq.setHeader("origin", apiTarget)
    })
  },
}

export default defineConfig({
  server: {
    // portless routes to the PORT it assigns. Only under portless: a PORT from .env is the API's.
    ...(portlessUrl && process.env.PORT
      ? { port: Number(process.env.PORT), strictPort: true, host: process.env.HOST }
      : {}),
    proxy: Object.fromEntries(
      ["/api", "/v1", "/mcp", "/.well-known"].map((path) => [path, apiProxy]),
    ),
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: "/index" } },
    }),
    react(),
  ],
  environments: {
    client: { build: { outDir: "dist" } },
    ssr: { build: { outDir: "build/server" } },
  },
})
