import type { RegistryMeta } from "@starter/api"

// What this product is, as the outside world sees it. The API's title, version and description
// (OpenAPI, llms.txt, /.well-known/mcp/server.json), its MCP registry entry, and the public origin
// that the committed server.json and the shipped skill name all come from here. `pnpm init-project`
// rewrites the placeholders; a deployment's runtime base URL still comes from the environment.
// Keep the CLI and SDK versions (packages/cli, packages/sdk) equal to `version`: product.test.ts
// checks it.

export const PRODUCT = {
  /** The display name: the API's title. */
  name: "Starter API",
  version: "0.0.0",
  /** One sentence on what the product does. */
  description: "The Starter API. Replace this with one sentence about what your product does.",
  /** The production API origin, no trailing slash. Set it to the domain you deploy to. */
  publicURL: "https://api.example.com",
  /**
   * The MCP registry entry. The registry name is reverse-DNS in a namespace you can prove
   * (`io.github.<owner>/<repo>`, or your domain with `--domain`). Renaming it before publishing
   * is the point of this file.
   */
  registry: {
    name: "io.github.example/starter",
    description: "Starter API: projects, API keys, agent access and audit for people and agents.",
    repository: { url: "https://github.com/example/starter", source: "github" },
  } satisfies RegistryMeta,
} as const
