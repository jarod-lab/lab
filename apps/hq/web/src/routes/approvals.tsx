import { createRoute } from "@tanstack/react-router"

import { EmptyState } from "../components/states"
import { PageHeader } from "../components/page-header"
import { appRoute } from "./app"

// A placeholder until the screen's own task replaces it.
export const approvalsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/approvals",
  component: () => (
    <>
      <PageHeader title="Approvals" />
      <EmptyState title="Coming next" />
    </>
  ),
})
