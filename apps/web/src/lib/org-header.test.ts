import { describe, expect, it } from "vitest"

// The server's header name (packages/api/src/headers.ts). apps/web does not depend on @starter/api,
// so the literal lives in org-header.ts; this test keeps the two equal. headers.ts has no imports.
import { ORGANIZATION_HEADER } from "@starter/auth/client"
import { X_ORGANIZATION_ID, organizationHeaders } from "./org-header"

describe("X-Organization-Id", () => {
  it("is the header the server reads", () => {
    expect(X_ORGANIZATION_ID).toBe(ORGANIZATION_HEADER)
  })

  it("sends the organization under that header", () => {
    expect(organizationHeaders("org-a")).toEqual({ [ORGANIZATION_HEADER]: "org-a" })
  })
})
