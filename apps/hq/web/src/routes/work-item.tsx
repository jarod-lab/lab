import { createRoute } from "@tanstack/react-router"

import { EmptyState } from "../components/states"
import { appRoute } from "./app"

/** One work item (`/work/FAC-12` or `/work/<uuid>`): a placeholder until Task 17b builds it. */
export const workItemRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/work/$itemId",
  component: () => <EmptyState title="Coming next" description="The item page is not built yet." />,
})
