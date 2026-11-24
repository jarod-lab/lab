import { createRoute } from "@tanstack/react-router"

import { EmptyState } from "../components/states"
import { PageHeader } from "../components/page-header"
import { appRoute } from "./app"

// A placeholder until the screen's own task replaces it.
export const runnerRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/runner",
  component: () => (
    <>
      <PageHeader title="Runner & policy" />
      <EmptyState title="Coming next" />
    </>
  ),
})
