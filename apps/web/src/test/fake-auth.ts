import { vi } from "vitest"

import type { WebAuth } from "../lib/web-auth"

/** A WebAuth whose calls succeed by default. Override the ones a test is about. */
export function fakeAuth(overrides: Partial<WebAuth> = {}): WebAuth {
  return {
    getSession: vi.fn(async () => ({
      user: { id: "user-1", email: "ada@example.com", name: "Ada" },
      activeOrganizationId: "org-a",
    })),
    signIn: vi.fn(async () => undefined),
    signUp: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    listOrganizations: vi.fn(async () => [
      { id: "org-a", name: "Analytical Ltd" },
      { id: "org-b", name: "Babbage Labs" },
    ]),
    setActiveOrganization: vi.fn(async () => undefined),
    getClientName: vi.fn(async () => "Claude Code"),
    consent: vi.fn(async () => undefined),
    continueOAuth: vi.fn(async () => "https://auth.example.com/oauth2/authorize?resumed=1"),
    getInvitation: vi.fn(async () => ({
      id: "inv-1",
      organizationName: "Babbage Labs",
      email: "ada@example.com",
      role: "member",
      status: "pending",
    })),
    acceptInvitation: vi.fn(async () => undefined),
    resetPassword: vi.fn(async () => undefined),
    device: {
      lookup: vi.fn(async () => ({ status: "pending", clientId: "client-1", scope: "read write" })),
      approve: vi.fn(async () => undefined),
      deny: vi.fn(async () => undefined),
    },
    ...overrides,
  }
}
