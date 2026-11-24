import { createRoute } from "@tanstack/react-router"

import { EmptyState } from "../components/states"
import { appRoute } from "./app"

/** The Work board: a placeholder until Task 16 builds the screen. */
export const workRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/work",
  component: () => (
    <EmptyState title="Coming next" description="The Work board is not built yet." />
  ),
})
