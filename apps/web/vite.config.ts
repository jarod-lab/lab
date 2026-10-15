import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { type ProxyOptions, defineConfig } from "vite"

// SPA mode: the build prerenders one HTML shell and the client assets into `dist/` (index.html plus
// assets/, served by apps/api). The server bundle the plugin emits is never served, so it stays out.

// Dev only: the API (auth, REST, MCP, OAuth discovery) lives on its own origin, so the dev server
// forwards those paths to it and the session cookies and OAuth issuer match what the browser sees.
// API_URL is read here because this file runs in Node, not in the app. It defaults to the port
// apps/api uses when no URL is set.
const apiTarget = process.env.API_URL ?? "http://localhost:3000"

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
