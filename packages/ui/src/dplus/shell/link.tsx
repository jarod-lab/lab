import type * as React from "react"
import { createContext, useContext } from "react"

/** Anchor props plus the target. Apps pass a router link here (TanStack `Link` takes `to`, so map it). */
export type LinkProps = React.ComponentProps<"a"> & { href: string }

/** Renders one link. Base UI menus and breadcrumbs hand us their own props, so this spreads them. */
export type RenderLink = (props: LinkProps) => React.ReactElement

/** Default: a plain anchor. */
export const anchorLink: RenderLink = (props) => <a {...props}>{props.children}</a>

const ShellLinkContext = createContext<RenderLink>(anchorLink)

/** Provide one router link for every shell component under it (see AppShell's `renderLink`). */
export function ShellLinkProvider({
  renderLink,
  children,
}: {
  renderLink: RenderLink
  children: React.ReactNode
}) {
  return <ShellLinkContext.Provider value={renderLink}>{children}</ShellLinkContext.Provider>
}

/** A component's own `renderLink` wins; otherwise the nearest provider's; otherwise an anchor. */
export function useRenderLink(override?: RenderLink): RenderLink {
  const fromContext = useContext(ShellLinkContext)
  return override ?? fromContext
}
