import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// SPA mode: the build prerenders one HTML shell and the client assets into `dist/` (index.html plus
// assets/, served by apps/api). The server bundle the plugin emits is never served, so it stays out.
// Dev only: the API (auth, REST, MCP, OAuth discovery) is served from its own origin, so the dev
// server forwards those paths to it. Same origin keeps the session cookies and the OAuth issuer
// consistent with what the browser sees. API_URL is read here because this file runs in Node, not
// in the app; it defaults to the port apps/api uses when no URL is set.
const apiTarget = process.env.API_URL ?? "http://localhost:3000"
const proxied = ["/api", "/v1", "/mcp", "/.well-known"]

export default defineConfig({
  server: {
    proxy: Object.fromEntries(
      proxied.map((path) => [path, { target: apiTarget, changeOrigin: true }]),
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
