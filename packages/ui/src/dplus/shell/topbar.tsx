import { cn } from "cn"
import { Fragment } from "react"
import { InboxIcon, SearchIcon } from "lucide-react"
import { Badge } from "../../components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../../components/ui/breadcrumb"
import { Button } from "../../components/ui/button"
import { Kbd, KbdGroup } from "../../components/ui/kbd"
import { SidebarTrigger } from "../../components/ui/sidebar"
import { type LinkProps, type RenderLink, useRenderLink } from "./link"

export type Crumb = { label: string; href?: string }

export type TopbarProps = {
  /** Where you are. The last crumb is the current page. */
  crumbs: Crumb[]
  onOpenSearch?: () => void
  /** Text in the ⌘K trigger. */
  searchLabel?: string
  /** Items that need you. Zero shows an empty inbox, not a "0" badge. */
  inbox?: { count: number; onOpen?: () => void }
  /**
   * Shows the phone-width menu button that opens the sidebar drawer. Needs an AppShell
   * (SidebarProvider) around it.
   */
  showMenuButton?: boolean
  renderLink?: RenderLink
  className?: string
}

function Crumbs({ crumbs, renderLink }: { crumbs: Crumb[]; renderLink: RenderLink }) {
  return (
    <Breadcrumb className="min-w-0 flex-1">
      <BreadcrumbList className="flex-nowrap overflow-hidden text-[15px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <Fragment key={`${i}-${c.label}`}>
              <BreadcrumbItem className="shrink-0 whitespace-nowrap">
                {last ? (
                  <BreadcrumbPage>{c.label}</BreadcrumbPage>
                ) : c.href ? (
                  <BreadcrumbLink
                    render={(props) =>
                      renderLink({ ...props, href: c.href as string } as LinkProps)
                    }
                    className="underline underline-offset-3"
                  >
                    {c.label}
                  </BreadcrumbLink>
                ) : (
                  <span>{c.label}</span>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** Top bar: breadcrumb (where am I), ⌘K trigger, inbox, and the phone menu button. */
export function Topbar({
  crumbs,
  onOpenSearch,
  searchLabel = "Search or ask an agent",
  inbox,
  showMenuButton = false,
  renderLink: renderLinkProp,
  className,
}: TopbarProps) {
  const renderLink = useRenderLink(renderLinkProp)
  const count = inbox?.count ?? 0
  return (
    <header
      className={cn(
        "flex h-15 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:px-6",
        className,
      )}
    >
      {showMenuButton && (
        <SidebarTrigger
          variant="outline"
          size="icon"
          aria-label="Open navigation"
          className="size-11 border-[1.5px] md:hidden"
        />
      )}
      <Crumbs crumbs={crumbs} renderLink={renderLink} />
      <Button
        variant="outline"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={onOpenSearch}
        aria-label={searchLabel}
        className="h-11 w-11 justify-center border border-border px-0 font-normal text-muted-foreground sm:h-10 sm:w-65 sm:justify-start sm:px-3.5 sm:pr-2"
      >
        <SearchIcon aria-hidden="true" />
        <span className="sr-only flex-1 text-left sm:not-sr-only">{searchLabel}</span>
        <KbdGroup className="hidden sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label={count > 0 ? `Inbox, ${count} need you` : "Inbox, nothing needs you"}
        onClick={inbox?.onOpen}
        className="relative size-11 border"
      >
        <InboxIcon className="size-5" />
        {count > 0 && (
          <Badge
            variant="solar"
            aria-hidden="true"
            className="absolute -top-2 -right-2 h-5 min-w-5 rounded-md border-2 border-background px-1 text-[11.5px] font-extrabold"
          >
            {count}
          </Badge>
        )}
      </Button>
    </header>
  )
}
