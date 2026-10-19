import { describe, expect, it } from "vitest"

import { json, productFetch } from "../test/product-fetch"
import { createApiKeysApi } from "./api-keys-api"

const key = {
  id: "1",
  name: "CI",
  start: "ak_live_",
  permissions: { project: ["read"] },
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: { id: "user-1", name: "Ada" },
  lastUsedAt: null,
  expiresAt: null,
}

describe("createApiKeysApi", () => {
  it("lists keys through list_api_keys, sending the organization header", async () => {
    const { fetchImpl, sent } = productFetch(() => json({ keys: [key] }))
    const keys = await createApiKeysApi(fetchImpl).listKeys("org-a")
    expect(keys).toEqual([key])
    expect(sent[0]).toMatchObject({
      method: "GET",
      path: "/v1/api-keys",
      organization: "org-a",
      credentials: "same-origin",
    })
  })

  it("shows the server's message when the list is refused", async () => {
    const { fetchImpl } = productFetch(() =>
      json(
        { error: { code: "FORBIDDEN", message: "Your role can't read API keys" } },
        { status: 403 },
      ),
    )
    await expect(createApiKeysApi(fetchImpl).listKeys("org-a")).rejects.toThrow(
      "Your role can't read API keys",
    )
  })

  it("creates a key with the organization header and returns the secret", async () => {
    const { fetchImpl, sent } = productFetch(() =>
      json({ id: "1", key: "sk_test_secret", permissions: {} }),
    )
    const created = await createApiKeysApi(fetchImpl).createKey("org-a", {
      name: "CI",
      permissions: { project: ["read"] },
    })
    expect(created.key).toBe("sk_test_secret")
    expect(sent[0]).toMatchObject({ method: "POST", path: "/v1/api-keys", organization: "org-a" })
    expect(sent[0]?.body).toEqual({ name: "CI", permissions: { project: ["read"] } })
  })

  it("shows the server's message and hint when a key is refused", async () => {
    const { fetchImpl } = productFetch(() =>
      json(
        {
          error: {
            code: "FORBIDDEN",
            message: "A key can't have permissions its creator doesn't have",
            hint: "Pick fewer.",
          },
        },
        { status: 403 },
      ),
    )
    await expect(
      createApiKeysApi(fetchImpl).createKey("org-a", {
        name: "x",
        permissions: { run: ["approve"] },
      }),
    ).rejects.toThrow("A key can't have permissions its creator doesn't have Pick fewer.")
  })

  it("revokes by the connected-agent id, which is the key id with a key_ prefix", async () => {
    const { fetchImpl, sent } = productFetch(() => json({ revoked: true }))
    await createApiKeysApi(fetchImpl).revokeKey("org-a", "1")
    expect(sent[0]).toMatchObject({ method: "DELETE", path: "/v1/agents/key_1" })
  })
})
