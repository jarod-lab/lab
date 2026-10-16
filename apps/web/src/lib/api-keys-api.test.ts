import { describe, expect, it, vi } from "vitest"

import { createApiKeysApi } from "./api-keys-api"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("createApiKeysApi", () => {
  it("lists only API keys, sending the organization header", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        agents: [
          {
            id: "key_1",
            type: "apiKey",
            clientId: null,
            keyId: "1",
            name: "CI",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastUsedAt: null,
            access: ["project:read"],
          },
          {
            id: "client_x",
            type: "oauthClient",
            clientId: "x",
            keyId: null,
            name: "Claude",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastUsedAt: null,
            access: [],
          },
        ],
      }),
    )
    const keys = await createApiKeysApi(fetchImpl as unknown as typeof fetch).listKeys("org-a")
    expect(keys).toEqual([
      {
        id: "key_1",
        name: "CI",
        access: ["project:read"],
        createdAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: null,
      },
    ])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/v1/agents")
    expect((init.headers as Record<string, string>)["X-Organization-Id"]).toBe("org-a")
  })

  it("creates a key with the organization header and returns the secret", async () => {
    const fetchImpl = vi.fn(async () => json({ id: "1", key: "sk_test_secret", permissions: {} }))
    const created = await createApiKeysApi(fetchImpl as unknown as typeof fetch).createKey(
      "org-a",
      {
        name: "CI",
        permissions: { project: ["read"] },
      },
    )
    expect(created.key).toBe("sk_test_secret")
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/v1/api-keys")
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual({
      name: "CI",
      permissions: { project: ["read"] },
    })
    expect((init.headers as Record<string, string>)["X-Organization-Id"]).toBe("org-a")
  })

  it("shows the server's message and hint when a key is refused", async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        {
          error: {
            code: "FORBIDDEN",
            message: "A key can't have permissions its creator doesn't have",
            hint: "Pick fewer.",
          },
        },
        403,
      ),
    )
    await expect(
      createApiKeysApi(fetchImpl as unknown as typeof fetch).createKey("org-a", {
        name: "x",
        permissions: { run: ["approve"] },
      }),
    ).rejects.toThrow("A key can't have permissions its creator doesn't have Pick fewer.")
  })

  it("revokes by the agent id", async () => {
    const fetchImpl = vi.fn(async () => json({ revoked: true }))
    await createApiKeysApi(fetchImpl as unknown as typeof fetch).revokeKey("org-a", "key_1")
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/v1/agents/key_1")
    expect(init.method).toBe("DELETE")
  })
})
