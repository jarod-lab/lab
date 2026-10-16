import { cn } from "cn"
import { XIcon } from "lucide-react"
import type * as React from "react"
import { useState } from "react"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../../components/ui/sidebar"
import { type StatusState, Status } from "../status"
import { type LinkProps, type RenderLink, useRenderLink } from "./link"
import { OrgPicker, type OrgPickerProps } from "./org-picker"
import { Shortcut } from "./shortcut"
import { UserMenu, type UserMenuProps } from "./user-menu"

export type NavItem = {
  id: string
  label: string
  href: string
  /** Visible keycaps, e.g. ["G", "A"]. */
  shortcut?: string[]
  /** A live status word, e.g. "2 running". */
  status?: { state: StatusState; label?: string }
  /** A count that needs the user, e.g. 3 "waiting". Solar, so it reads as "you". */
  count?: { value: number; label: string }
}

export type PinnedAgent = {
  id: string
  name: string
  href: string
  state: StatusState
  /** Overrides the default word for the state. */
  label?: string
}

export type Announcement = {
  id: string
  badge?: string
  title: string
  href?: string
  linkLabel?: string
}

export type AppSidebarProps = {
  org: Omit<OrgPickerProps, "renderLink">
  nav: NavItem[]
  /** The current page: the matching nav item or pinned agent gets `aria-current`. */
  activeId?: string
  pinnedAgents?: PinnedAgent[]
  announcement?: Announcement
  onDismissAnnouncement?: (id: string) => void
  support: { href: string; label?: string }
  account: Omit<UserMenuProps, "renderLink">
  renderLink?: RenderLink
  className?: string
}

function AnnouncementCard({
  announcement,
  onDismiss,
  renderLink,
}: {
  announcement: Announcement
  onDismiss: () => void
  renderLink: RenderLink
}) {
  return (
    <section
      aria-label="Announcement"
      className="relative mb-2 flex flex-col gap-1 rounded-[10px] bg-primary p-3.5 text-primary-foreground"
    >
      {announcement.badge && (
        <Badge variant="solar" size="sm" className="self-start">
          {announcement.badge}
        </Badge>
      )}
      <span className="mt-1 pr-6.5 text-base leading-tight font-bold">{announcement.title}</span>
      {announcement.href && (
        <span className="text-sm underline underline-offset-3">
          {renderLink({
            href: announcement.href,
            children: announcement.linkLabel ?? "Read more",
          })}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Dismiss announcement: ${announcement.title}`}
        onClick={onDismiss}
        className="absolute top-1.5 right-1.5 size-8 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
      >
        <XIcon />
      </Button>
    </section>
  )
}

/** Sidebar of the app: org picker, workspace nav, pinned agents, one announcement, Support, account. */
export function AppSidebar({
  org,
  nav,
  activeId,
  pinnedAgents = [],
  announcement,
  onDismissAnnouncement,
  support,
  account,
  renderLink: renderLinkProp,
  className,
}: AppSidebarProps) {
  const renderLink = useRenderLink(renderLinkProp)
  const [dismissed, setDismissed] = useState<string[]>([])
  const visible = announcement && !dismissed.includes(announcement.id) ? announcement : undefined

  const item = (
    id: string,
    label: string,
    href: string,
    extra: React.ReactNode,
  ): React.ReactNode => {
    const active = id === activeId
    return (
      <SidebarMenuItem key={id}>
        <SidebarMenuButton
          isActive={active}
          className="h-10 px-2.5 text-[15px]"
          render={(props) =>
            renderLink({
              ...props,
              href,
              "aria-current": active ? "page" : undefined,
            } as LinkProps)
          }
        >
          <span className={cn(active && "highlight self-start px-0.5")}>{label}</span>
          {extra}
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="offcanvas" aria-label="Primary" className={cn("text-[15px]", className)}>
      <SidebarHeader className="px-3 pt-4 pb-3.5">
        <OrgPicker {...org} renderLink={renderLink} />
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1">
        <SidebarGroup className="py-0">
          <SidebarMenu aria-label="Workspace" className="gap-0.5">
            {nav.map((n) =>
              item(
                n.id,
                n.label,
                n.href,
                <>
                  {n.shortcut && <Shortcut keys={n.shortcut} />}
                  {n.status && (
                    <Status state={n.status.state} className="ml-auto text-[13px]">
                      {n.status.label}
                    </Status>
                  )}
                  {n.count && (
                    <Badge
                      variant="solar"
                      className="ml-auto h-5.5 rounded-full px-2.25 text-[12.5px]"
                    >
                      {n.count.value} {n.count.label}
                    </Badge>
                  )}
                </>,
              ),
            )}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="pt-4.5">
          <SidebarGroupLabel
            className="h-auto px-2.5 pb-1.5"
            render={(props) => <h2 {...props}>{props.children}</h2>}
          >
            Pinned agents
          </SidebarGroupLabel>
          {pinnedAgents.length > 0 ? (
            <SidebarMenu aria-label="Pinned agents" className="gap-0.5">
              {pinnedAgents.map((a) =>
                item(
                  a.id,
                  a.name,
                  a.href,
                  <Status state={a.state} className="ml-auto text-[13px]">
                    {a.label}
                  </Status>,
                ),
              )}
            </SidebarMenu>
          ) : (
            <p className="px-2.5 text-sm text-muted-foreground">Pin an agent to see it here.</p>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-0.5 px-3 pb-4">
        {visible && (
          <AnnouncementCard
            announcement={visible}
            renderLink={renderLink}
            onDismiss={() => {
              setDismissed((d) => [...d, visible.id])
              onDismissAnnouncement?.(visible.id)
            }}
          />
        )}
        {renderLink({
          href: support.href,
          className: "flex h-10 items-center px-2.5 text-sidebar-foreground",
          children: support.label ?? "Support",
        })}
        <div className="mt-1.5">
          <UserMenu {...account} renderLink={renderLink} />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
