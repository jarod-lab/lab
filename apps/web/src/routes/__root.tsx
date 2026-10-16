import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router"
import { type ReactNode, Suspense, lazy, useEffect, useState } from "react"

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
    // A plain external script (public/assets/theme.js, served with the other assets) so the dark
    // class is set before the body paints.
    scripts: [{ src: "/assets/theme.js" }],
  }),
  shellComponent: RootDocument,
  component: RootOutlet,
})

/** The query provider wraps the matched page and the devtools; the shell has neither. */
function RootOutlet() {
  const { queryClient } = Route.useRouteContext()
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      {DevtoolsPanel ? (
        <Suspense fallback={null}>
          <DevtoolsPanel />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  )
}

/** styles.css defines dark tokens under `.dark`, so the class follows the OS setting. */
function useSystemDarkMode() {
  useEffect(() => {
    // Some embedded webviews and test DOMs have no matchMedia; the page then stays in light mode.
    if (typeof window.matchMedia !== "function") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => document.documentElement.classList.toggle("dark", media.matches)
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [])
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
  useSystemDarkMode()
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
