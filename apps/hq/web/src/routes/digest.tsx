import { createRoute } from "@tanstack/react-router"

import { EmptyState } from "../components/states"
import { PageHeader } from "../components/page-header"
import { appRoute } from "./app"

// A placeholder until the screen's own task replaces it.
export const digestRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/digest",
  component: () => (
    <>
      <PageHeader title="Digest" />
      <EmptyState title="Coming next" />
    </>
  ),
})
