import { generateKeyPairSync } from "node:crypto"
import { vi } from "vitest"

/**
 * A GitHub App for tests that mint through the default minter: a throwaway RSA key in the
 * environment (the vault's place in production) and a fake GitHub as the global `fetch` that
 * records each installation token request and answers it. Call `restore()` (or
 * `vi.unstubAllEnvs()` and `vi.unstubAllGlobals()`) afterwards.
 */
export const APP_TOKEN = "ghs_FROMAPPKEY0123456789abcdefghijklmnopqr" // gitleaks:allow

export interface TokenRequest {
  url: string
  /** The JSON body: `repositories` and `permissions`, when narrowed. */
  body: { repositories?: string[]; permissions?: Record<string, string> }
}

export function stubGitHubApp(token = APP_TOKEN) {
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString()
  vi.stubEnv("GITHUB_APP_ID", "12345")
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", pem.replaceAll("\n", "\\n"))
  vi.stubEnv("GITHUB_INSTALLATION_ID", "987")
  const requests: TokenRequest[] = []
  vi.stubGlobal("fetch", async (input: unknown, init?: { body?: unknown }) => {
    requests.push({
      url: String(input),
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as TokenRequest["body"]) : {},
    })
    return new Response(JSON.stringify({ token, expires_at: "2099-01-01T00:00:00Z" }), {
      status: 201,
    })
  })
  return { requests, restore: () => (vi.unstubAllEnvs(), vi.unstubAllGlobals()) }
}
