import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { type ReactNode, useEffect } from "react"

import "../app.css"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
})

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

function RootDocument({ children }: { children: ReactNode }) {
  useSystemDarkMode()
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
