import { wrapsClient } from "@wraps.dev/better-auth/client"
import { createAuthClient } from "better-auth/client"

export const createClient = (baseURL?: string) =>
  createAuthClient({ baseURL, plugins: [wrapsClient()] })
