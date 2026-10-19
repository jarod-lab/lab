import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, envField, passthroughImageService } from "astro/config"

// A static site: every page is prerendered into dist/, with no client JavaScript unless a page asks
// for it. The sections are React components from src/components, server-rendered at build time.

// Under `pnpm dev`, portless serves this site as `site.<project>` and the web app as `app.<project>`
// (portless.json), with the branch as a prefix in a git worktree. SITE_URL and APP_URL are declared
// in packages/env; they are read here because this file runs in Node at build time.
const portlessUrl = process.env.PORTLESS_URL
const portlessApp = portlessUrl?.replace(/(.*[/.])site\./, "$1app.")

export default defineConfig({
  site: process.env.SITE_URL || portlessUrl || "http://localhost:4321",
  output: "static",
  integrations: [react()],
  // No raster images in the design (covers and previews are drawn in CSS), so no sharp.
  image: { service: passthroughImageService() },
  // Code blocks take the theme's inverse ink (site.css), not a highlighter's own colours.
  markdown: { syntaxHighlight: false },
  env: {
    schema: {
      APP_URL: envField.string({
        context: "client",
        access: "public",
        default: process.env.APP_URL || portlessApp || "http://localhost:3000",
      }),
    },
  },
  server:
    portlessUrl && process.env.PORT
      ? { port: Number(process.env.PORT), host: process.env.HOST }
      : undefined,
  vite: { plugins: [tailwindcss()] },
})
