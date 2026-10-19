// Type-level regression test, checked by `pnpm typecheck`.
// @wraps.dev/better-auth <0.2.2 made wrapsClient() drop signIn/signUp from the client type.
import { wrapsClient } from "@wraps.dev/better-auth/client"
import { createAuthClient } from "better-auth/client"
import { expectTypeOf } from "vitest"
import { createClient } from "./client"

// The same wrapsClient the product uses, with no other plugin: the product's plugins may extend
// these methods (passkey, two-factor) but must not change the email sign-in and sign-up signatures.
const plain = createAuthClient({ baseURL: "https://localhost:3000", plugins: [wrapsClient()] })
const client = createClient("https://localhost:3000")

// The product's plugins add options to these methods, so compare the call shape, not the exact type.
expectTypeOf(client.signIn.email).toBeFunction()
expectTypeOf(client.signUp.email).toBeFunction()
expectTypeOf(plain.signIn.email).toBeFunction()
expectTypeOf<Parameters<typeof client.signIn.email>[0]>().toMatchTypeOf<{
  email: string
  password: string
}>()
expectTypeOf<Parameters<typeof client.signUp.email>[0]>().toMatchTypeOf<{
  email: string
  password: string
  name: string
}>()

// The product's own roles, not just better-auth's defaults, are valid in the client. This file is
// only type-checked, never run.
void client.organization.inviteMember({ email: "a@example.com", role: "viewer" })
// @ts-expect-error not a role
void client.organization.inviteMember({ email: "a@example.com", role: "superuser" })
