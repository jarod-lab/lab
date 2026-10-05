import { createAuthClient } from "better-auth/client"

// `wrapsClient()` from @wraps.dev/better-auth/client is deliberately omitted: it is type-inference
// only, and with better-auth 1.7.7 it collapses the client type (drops `signIn`, etc.).
export const createClient = (baseURL?: string) => createAuthClient({ baseURL })
