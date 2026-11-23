import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { type RenderResult, render } from "@testing-library/react"
import userEvent, { type UserEvent } from "@testing-library/user-event"
import type { ReactNode } from "react"

import { createHqClient, type HqClient } from "../api/client"
import { createQueryClient } from "../api/query-client"
import { createFakeHq, type FakeHq } from "./fake-hq"

interface RouterContext {
  queryClient: QueryClient
  client: HqClient
}

/**
 * The router the harness mounts: basepath "/app", memory history, the app's context. Until the
 * app's own router exists (`createAppRouter`, the layout task) it has one catch-all route that
 * renders `ui`; that task swaps this for the real route tree and drops `ui`.
 */
function buildRouter(context: RouterContext, path: string, ui: ReactNode) {
  const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet })
  const catchAll = createRoute({
    getParentRoute: () => rootRoute,
    path: "$",
    component: () => ui,
  })
  return createRouter({
    routeTree: rootRoute.addChildren([catchAll]),
    history: createMemoryHistory({ initialEntries: [path] }),
    basepath: "/app",
    context,
  })
}
export type AppRouter = ReturnType<typeof buildRouter>

export type RenderAppResult = RenderResult & {
  router: AppRouter
  queryClient: QueryClient
  hq: FakeHq
  user: UserEvent
}

/**
 * Render the app against a fake hq. `path` is a public path (`/app/approvals`), default
 * `/app/digest`; the default hq has a founder signed in. Every request goes to `hq.fetch`.
 */
export async function renderApp(
  options: { path?: string; hq?: FakeHq; queryClient?: QueryClient; ui?: ReactNode } = {},
): Promise<RenderAppResult> {
  const hq = options.hq ?? createFakeHq()
  const queryClient = options.queryClient ?? createQueryClient()
  const client = createHqClient({ fetch: hq.fetch })
  const router = buildRouter(
    { queryClient, client },
    options.path ?? "/app/digest",
    options.ui ?? null,
  )
  await router.load()
  const user = userEvent.setup()
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return Object.assign(result, { router, queryClient, hq, user })
}
