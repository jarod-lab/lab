import { redirect } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"

import { sessionQuery } from "../containers/shell-data"
import type { WebAuth, WebSession } from "./web-auth"

/**
 * The signed-in session, or a redirect to sign-in that returns to `returnTo` (a path on this site,
 * carried as `next`, which /sign-in validates). Without `returnTo` the sign-in page's default
 * landing is used: `/` must not be a return target, because the API serves `/` (llms.txt).
 */
export async function requireSession(
  queryClient: QueryClient,
  auth: WebAuth,
  returnTo?: string,
): Promise<WebSession> {
  const session = await queryClient.ensureQueryData(sessionQuery(auth))
  if (!session) throw redirect({ to: "/sign-in", search: { next: returnTo } })
  return session
}
