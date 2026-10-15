import { createFileRoute } from "@tanstack/react-router"

import { ConsentPage } from "../pages/oauth-pages"
import { getWebAuth } from "../lib/web-auth"

const text = (value: unknown) => (typeof value === "string" ? value : undefined)

export const Route = createFileRoute("/consent")({
  validateSearch: (search: Record<string, unknown>) => ({
    client_id: text(search.client_id),
    scope: text(search.scope),
  }),
  component: ConsentRoute,
})

function ConsentRoute() {
  const { client_id, scope } = Route.useSearch()
  return <ConsentPage auth={getWebAuth()} clientId={client_id} scope={scope} />
}
