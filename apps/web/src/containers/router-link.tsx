import { Link } from "@tanstack/react-router"

import type { LinkProps } from "@starter/ui/dplus/shell/link"

/**
 * The shell's link renderer for TanStack Router: client navigation for app paths. Plain anchors
 * (and anything with a file extension, such as /llms.txt) are served by the API, so they load in
 * full. Shell components pass `href`; the router takes `to`.
 */
export function RouterLink({ href, ...rest }: LinkProps) {
  const { children, ...anchor } = rest
  if (/\.[a-z]+$/i.test(href.split("?")[0] ?? "")) {
    return (
      <a href={href} {...anchor}>
        {children}
      </a>
    )
  }
  return <Link {...rest} to={href as "/"} />
}
