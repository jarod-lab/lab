import { QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"
import type { RouterContext } from "./routes/__root"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  // One QueryClient per router: the server prerender and each test get their own cache.
  const queryClient = new QueryClient()
  const context: RouterContext = { queryClient }
  return createRouter({ routeTree, scrollRestoration: true, context })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
