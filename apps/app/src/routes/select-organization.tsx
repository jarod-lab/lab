import { createFileRoute } from "@tanstack/react-router"

import { SelectOrganizationPage } from "../pages/oauth-pages"
import { getWebAuth } from "../lib/web-auth"

export const Route = createFileRoute("/select-organization")({
  component: SelectOrganizationRoute,
})

function SelectOrganizationRoute() {
  return <SelectOrganizationPage auth={getWebAuth()} />
}
