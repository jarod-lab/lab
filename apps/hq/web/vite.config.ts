import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The app is served at /app by the Build Output (scripts/build-vercel.mjs writes it to
// .vercel/output/static/app). envDir is off: no .env file and no VITE_ value reaches the bundle.
export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  base: "/app/",
  plugins: [tailwindcss(), react()],
  envDir: false,
  build: { target: "es2022", sourcemap: false },
  resolve: { dedupe: ["react", "react-dom"] },
})
