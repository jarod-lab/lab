import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// SPA mode: the build prerenders one HTML shell and the client assets into `dist/` (index.html plus
// assets/, served by apps/api). The server bundle the plugin emits is never served, so it stays out.
export default defineConfig({
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
