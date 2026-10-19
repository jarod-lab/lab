import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router"
import { type ReactNode, Suspense, lazy, useEffect, useState } from "react"

import { ReauthProvider } from "../components/reauth-dialog"
import { ImpersonationBanner } from "../containers/impersonation-banner"
import { getAdminApi } from "../lib/admin-api"
import { useThemeSync } from "../lib/theme"
import themeBootScript from "../theme-boot.js?raw"

import "../app.css"

export interface RouterContext {
  queryClient: QueryClient
}

// Devtools are dev only. In the production build `import.meta.env.DEV` is false, so this is null and
// the dynamic import is dropped: no devtools code reaches dist/. Tests (MODE "test") skip them too:
// under jsdom the devtools core resolves to its server build, which throws when the tree unmounts.
const DevtoolsPanel =
  import.meta.env.DEV && import.meta.env.MODE !== "test" ? lazy(() => import("../devtools")) : null

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    // Inline (apps/api's CSP allows it by hash) so the dark class is set before the body paints, and
    // never stale: an external /assets file would be cached as immutable without a content hash.
    scripts: [{ children: themeBootScript }],
  }),
  shellComponent: RootDocument,
  component: RootOutlet,
})

/** The query provider wraps the matched page and the devtools; the shell has neither. */
function RootOutlet() {
  const { queryClient } = Route.useRouteContext()
  return (
    <QueryClientProvider client={queryClient}>
      {/* One "Confirm it's you" dialog for every page's refused sensitive action (lib/reauth.ts). */}
      <ReauthProvider>
        {/* While an admin acts as someone else, every page shows the strip with Stop. */}
        <ImpersonationBanner api={getAdminApi()} />
        <Outlet />
        {DevtoolsPanel ? (
          <Suspense fallback={null}>
            <DevtoolsPanel />
          </Suspense>
        ) : null}
      </ReauthProvider>
    </QueryClientProvider>
  )
}

/**
 * The prerendered shell holds the root alone, with no route content. Hydration would otherwise
 * render the matched page where the shell has its pending boundary (React #418). So the first
 * client render matches the shell (empty), and the route renders after mount. The browser only
 * ever sees the shell for an instant.
 */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}

function RootDocument({ children }: { children: ReactNode }) {
  useThemeSync()
  const hydrated = useHydrated()
  return (
    // suppressHydrationWarning: theme.js sets the dark class before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background text-foreground antialiased">
        {hydrated ? children : null}
        <Scripts />
      </body>
    </html>
  )
}
