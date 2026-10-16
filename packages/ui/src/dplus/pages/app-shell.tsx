import type { Decorator } from "@storybook/react-vite"
import { cn } from "cn"
import { InboxIcon, PlusIcon, XIcon } from "lucide-react"
import * as React from "react"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { Kbd, KbdGroup } from "../../components/ui/kbd"
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
  SidebarProvider,
} from "../../components/ui/sidebar"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { OrgMark } from "../org-mark"
import { Status, StatusIcon } from "../status"

// The shared app shell from the D+ boards (Component — Sidebar, Top bar, Settings header & tabs).
// Story-only: pages compose it so a component change shows up against the whole layout.

/** Dark theme for a page story. Menus portal to <body>, so the class goes on <html>. */
export const withDark: Decorator = (Story) => {
  React.useEffect(() => {
    document.documentElement.classList.add("dark")
    return () => document.documentElement.classList.remove("dark")
  }, [])
  return <Story />
}

const Keys = ({ keys, className }: { keys: string[]; className?: string }) => (
  <KbdGroup className={cn("ml-auto", className)}>
    {keys.map((k) => (
      <Kbd key={k}>{k}</Kbd>
    ))}
  </KbdGroup>
)

const orgs = [
  { id: "acme", name: "Acme Inc", meta: "Owner · 12 members", look: "filled" as const },
  { id: "northwind", name: "Northwind Labs", meta: "Viewer · read only", look: "outline" as const },
  { id: "jordan", name: "Jordan's workspace", meta: "Personal · Owner", look: "personal" as const },
]

function OrgPicker({ open, creating }: { open: boolean; creating: boolean }) {
  return (
    <DropdownMenu open={open} modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label="Switch organization, current Acme Inc"
            className={cn(
              "h-12 w-full justify-start gap-2.5 border border-border px-2 text-left font-normal hover:bg-sidebar-accent",
              open && "border-2 border-foreground px-1.75",
            )}
          />
        }
      >
        <OrgMark name="Acme Inc" />
        <span className="flex flex-1 flex-col leading-tight">
          <span className="font-semibold">Acme Inc</span>
          <span className="text-xs text-muted-foreground">Owner · Pro plan</span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          ▾
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-75" sideOffset={6}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[12.5px] font-bold tracking-wide">
            ORGANIZATIONS
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value="acme">
            {orgs.map((o) => (
              <DropdownMenuRadioItem key={o.id} value={o.id} className="min-h-12 gap-2.5">
                <OrgMark name={o.name} look={o.look} size="sm" />
                <span className="flex flex-1 flex-col leading-tight">
                  <span
                    className={cn(
                      "font-semibold",
                      o.id === "acme" && "highlight self-start px-0.5",
                    )}
                  >
                    {o.name}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">{o.meta}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-secondary-foreground"
          render={(props) => (
            <a {...props} href="#org-settings">
              {props.children}
            </a>
          )}
        >
          <span className="flex-1">Organization settings</span>
          <Keys keys={["G", "O"]} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="font-semibold"
          render={(props) => (
            <a {...props} href="#new" aria-current={creating ? "page" : undefined}>
              {props.children}
            </a>
          )}
        >
          <PlusIcon />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu({ open }: { open: boolean }) {
  return (
    <DropdownMenu open={open} modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label="Account menu, Jordan Lee"
            className="h-12 w-full justify-start gap-2.5 rounded-none border-0 border-t border-border px-2 font-semibold"
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback className="text-xs">JL</AvatarFallback>
        </Avatar>
        <span className="flex-1 text-left">Jordan Lee</span>
        <span aria-hidden="true" className="text-muted-foreground">
          ▴
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="w-70" sideOffset={6}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col py-2 text-sm leading-snug text-foreground">
            <span className="font-bold">Jordan Lee</span>
            <span className="text-[13px] font-normal text-muted-foreground">jordan@acme.dev</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Personal settings</DropdownMenuItem>
        <DropdownMenuItem>Security</DropdownMenuItem>
        <DropdownMenuItem>
          <span className="flex-1">Keyboard shortcuts</span>
          <Kbd>?</Kbd>
        </DropdownMenuItem>
        <div className="px-2.5 py-1">
          <ToggleGroup
            variant="outline"
            spacing={0}
            size="sm"
            defaultValue={["light"]}
            aria-label="Theme"
            className="w-full rounded-lg border-[1.5px]"
          >
            {["Light", "Dark", "System"].map((t) => (
              <ToggleGroupItem
                key={t}
                value={t.toLowerCase()}
                className="h-8 flex-1 px-2 text-[13px]"
              >
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NavLink({
  id,
  active,
  children,
}: {
  id: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        className="h-10 px-2.5 text-[15px]"
        render={(props) => (
          <a {...props} href={`#${id}`} aria-current={active ? "page" : undefined}>
            {props.children}
          </a>
        )}
      >
        {children}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export type SidebarMenuState = "none" | "org" | "user"

export function AppSidebar({
  active,
  menu = "none",
  announce = true,
  className,
}: {
  active: string
  menu?: SidebarMenuState
  announce?: boolean
  className?: string
}) {
  const nav: { id: string; label: string; extra?: React.ReactNode }[] = [
    { id: "home", label: "Home", extra: <Keys keys={["G", "H"]} /> },
    { id: "agents", label: "Agents", extra: <Keys keys={["G", "A"]} /> },
    {
      id: "runs",
      label: "Runs",
      extra: (
        <Status state="running" className="ml-auto text-[13px]">
          2 running
        </Status>
      ),
    },
    {
      id: "approvals",
      label: "Approvals",
      extra: (
        <Badge variant="solar" className="ml-auto h-5.5 rounded-full px-2.25 text-[12.5px]">
          3 waiting
        </Badge>
      ),
    },
    { id: "settings", label: "Settings" },
  ]
  const pinned: { id: string; label: string; status: React.ReactNode }[] = [
    {
      id: "release-triage",
      label: "Release triage",
      status: (
        <span className="ml-auto inline-flex">
          <StatusIcon state="running" />
          <span className="sr-only">Running</span>
        </span>
      ),
    },
    {
      id: "support-drafts",
      label: "Support drafts",
      status: (
        <Status state="needs-you" className="ml-auto text-[13px] font-bold">
          Needs you
        </Status>
      ),
    },
    {
      id: "weekly-digest",
      label: "Weekly digest",
      status: (
        <Status state="queued" className="ml-auto text-[13px]">
          Idle
        </Status>
      ),
    },
  ]
  return (
    <Sidebar
      collapsible="none"
      aria-label="Primary"
      className={cn("h-full w-63 border-r border-sidebar-border text-[15px]", className)}
    >
      <SidebarHeader className="px-3 pt-4 pb-3.5">
        <OrgPicker open={menu === "org"} creating={active === "new"} />
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1">
        <SidebarGroup className="py-0">
          <SidebarMenu aria-label="Workspace" className="gap-0.5">
            {nav.map((item) => (
              <NavLink key={item.id} id={item.id} active={item.id === active}>
                <span>{item.label}</span>
                {item.extra}
              </NavLink>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="pt-4.5">
          <SidebarGroupLabel
            className="h-auto px-2.5 pb-1.5"
            render={(props) => <h2 {...props}>{props.children}</h2>}
          >
            Pinned agents
          </SidebarGroupLabel>
          <SidebarMenu aria-label="Pinned agents" className="gap-0.5">
            {pinned.map((item) => (
              <NavLink key={item.id} id={item.id} active={item.id === active}>
                <span>{item.label}</span>
                {item.status}
              </NavLink>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-0.5 px-3 pb-4">
        {announce && (
          <section
            aria-label="Announcement"
            className="relative mb-2 flex flex-col gap-1 rounded-[10px] bg-primary p-3.5 text-primary-foreground"
          >
            <Badge variant="solar" size="sm" className="self-start">
              NEW
            </Badge>
            <span className="mt-1 pr-6.5 text-base leading-tight font-bold">
              Agents can open pull requests
            </span>
            <a href="#post" className="text-sm underline underline-offset-3">
              Read the post
            </a>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss announcement"
              className="absolute top-1.5 right-1.5 size-8 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            >
              <XIcon />
            </Button>
          </section>
        )}
        <a href="#support" className="flex h-10 items-center px-2.5 text-sidebar-foreground">
          Support
        </a>
        <div className="mt-1.5">
          <UserMenu open={menu === "user"} />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

export function Topbar({
  crumbs,
  search = "Search or ask an agent",
}: {
  crumbs: string[]
  search?: string
}) {
  return (
    <header className="flex h-15 shrink-0 items-center gap-3 border-b border-border px-6">
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="text-[15px]">
          {crumbs.map((c, i) =>
            i === crumbs.length - 1 ? (
              <BreadcrumbItem key={c}>
                <BreadcrumbPage>{c}</BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              <React.Fragment key={c}>
                <BreadcrumbItem>
                  <BreadcrumbLink href={`#${c}`} className="underline underline-offset-3">
                    {c}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </React.Fragment>
            ),
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <Button
        variant="outline"
        className="h-10 w-65 justify-start border border-border px-3.5 pr-2 font-normal text-muted-foreground"
      >
        <span className="flex-1 text-left">{search}</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Inbox, 3 need you"
        className="relative border"
      >
        <InboxIcon className="size-5" />
        <span
          aria-hidden="true"
          className="absolute -top-2 -right-2 grid h-5 min-w-5 place-items-center rounded-md border-2 border-background bg-solar px-1 text-[11.5px] font-extrabold text-solar-foreground"
        >
          3
        </span>
      </Button>
    </header>
  )
}

const orgTabs: { id: string; label: string; count?: string; badge?: string }[] = [
  { id: "general", label: "General" },
  { id: "members", label: "Members", count: "12" },
  { id: "api-keys", label: "API keys" },
  { id: "billing", label: "Billing" },
  { id: "agents", label: "Agents" },
  { id: "integrations", label: "Integrations", badge: "1 expired" },
]

/** Settings level 1: page title, context, and line tabs with an ink underline. */
export function SettingsHeader({ active, role = "Owner" }: { active: string; role?: string }) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-border px-9 pt-5">
      <div className="flex items-baseline gap-3.5">
        <h1 className="type-h1">Organization settings</h1>
        <span className="text-sm text-muted-foreground">Acme Inc · you are {role}</span>
      </div>
      <Tabs value={active} className="-mb-px">
        <TabsList variant="line" aria-label="Organization settings sections" className="gap-0.5">
          {orgTabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-none px-3 text-[15px]">
              {t.label}
              {t.count && (
                <span className="text-[13px] font-normal text-muted-foreground">{t.count}</span>
              )}
              {t.badge && (
                <Badge variant="solar" size="sm">
                  {t.badge}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}

export function AppShell({
  active,
  crumbs,
  menu,
  height = 760,
  children,
}: {
  active: string
  crumbs: string[]
  menu?: SidebarMenuState
  height?: number
  children: React.ReactNode
}) {
  return (
    <SidebarProvider
      className="min-h-0 w-300 overflow-hidden bg-background text-[15px] text-foreground"
      style={{ height }}
    >
      <AppSidebar active={active} menu={menu} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar crumbs={crumbs} />
        {children}
      </div>
    </SidebarProvider>
  )
}
