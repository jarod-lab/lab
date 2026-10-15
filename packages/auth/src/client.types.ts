// Type-level regression test, checked by `pnpm typecheck`.
// @wraps.dev/better-auth <0.2.2 made wrapsClient() drop signIn/signUp from the client type.
import { createAuthClient } from "better-auth/client"
import { expectTypeOf } from "vitest"
import { createClient } from "./client"

const plain = createAuthClient({ baseURL: "http://localhost:3000" })
const client = createClient("http://localhost:3000")

expectTypeOf(client.signIn.email).toEqualTypeOf(plain.signIn.email)
expectTypeOf(client.signUp.email).toEqualTypeOf(plain.signUp.email)

// The product's own roles, not just better-auth's defaults, are valid in the client. This file is
// only type-checked, never run.
void client.organization.inviteMember({ email: "a@example.com", role: "viewer" })
// @ts-expect-error not a role
void client.organization.inviteMember({ email: "a@example.com", role: "superuser" })
