import { cn } from "cn"
import { PlusIcon } from "lucide-react"
import type * as React from "react"
import { Button } from "../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { Spinner } from "../../components/ui/spinner"
import { OrgMark } from "../org-mark"
import { type LinkProps, type RenderLink, useRenderLink } from "./link"
import { Shortcut } from "./shortcut"

/** A role as the picker names it. Labels only: the role catalog lives in apps/web, not here. */
export type OrgRole = "Owner" | "Admin" | "Member" | "Viewer" | "Approver" | "Operator" | "Billing"

export type OrgSummary = {
  id: string
  name: string
  slug: string
  role: OrgRole
  /** A personal workspace (created at signup), not a shared organization. */
  personal?: boolean
  /** The logo URL, when one was uploaded. */
  logo?: string | null
}

export type OrgPickerProps = {
  orgs: OrgSummary[]
  /** The org the session is in. `null` means none is active yet (choose one to continue). */
  activeOrgId: string | null
  /** `loading` and `error` ignore `orgs`. */
  status?: "ready" | "loading" | "error"
  /** Where a row goes, e.g. `/acme`. */
  hrefFor: (org: OrgSummary) => string
  settingsHref: string
  createHref: string
  /** Shown in the error state. */
  onRetry?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  renderLink?: RenderLink
  className?: string
}

function OrgRow({
  org,
  active,
  href,
  renderLink,
}: {
  org: OrgSummary
  active: boolean
  href: string
  renderLink: RenderLink
}) {
  const look = active ? "filled" : org.personal ? "personal" : "outline"
  return (
    <DropdownMenuItem
      className="min-h-12 gap-2.5"
      render={(props) =>
        renderLink({
          ...props,
          href,
          "aria-current": active ? "true" : undefined,
        } as LinkProps)
      }
    >
      <OrgMark name={org.name} logo={org.logo} look={look} size="sm" />
      <span className="flex flex-1 flex-col leading-tight">
        <span className={cn("font-semibold", active && "highlight self-start px-0.5")}>
          {org.name}
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          {org.personal ? `Personal · ${org.role}` : org.role}
        </span>
      </span>
      {active && <span className="text-[12.5px] font-bold">Current</span>}
    </DropdownMenuItem>
  )
}

/** Org switcher: the active org, every org with your role in it, and the org actions. */
export function OrgPicker({
  orgs,
  activeOrgId,
  status = "ready",
  hrefFor,
  settingsHref,
  createHref,
  onRetry,
  open,
  onOpenChange,
  renderLink: renderLinkProp,
  className,
}: OrgPickerProps) {
  const renderLink = useRenderLink(renderLinkProp)
  const active = orgs.find((o) => o.id === activeOrgId)
  const loading = status === "loading"

  let triggerName: React.ReactNode
  let triggerMeta: string
  let label: string
  if (loading) {
    triggerName = "Loading organizations"
    triggerMeta = "One moment"
    label = "Organizations, loading"
  } else if (status === "error") {
    triggerName = "Organizations unavailable"
    triggerMeta = "Could not load"
    label = "Organizations, could not load"
  } else if (active) {
    triggerName = active.name
    triggerMeta = active.personal ? `Personal · ${active.role}` : active.role
    label = `Switch organization, current ${active.name}`
  } else {
    triggerName = "Choose an organization"
    triggerMeta = "No organization active"
    label = "Choose an organization"
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger
        disabled={loading}
        render={
          <Button
            variant="ghost"
            aria-label={label}
            className={cn(
              "h-12 w-full justify-start gap-2.5 border border-border px-2 text-left font-normal hover:bg-sidebar-accent",
              open && "border-2 border-foreground px-1.75",
              className,
            )}
          />
        }
      >
        {active ? (
          <OrgMark name={active.name} logo={active.logo} />
        ) : (
          <span
            aria-hidden="true"
            className="size-7.5 shrink-0 rounded-md border-[1.5px] border-dashed border-muted-foreground"
          />
        )}
        <span className="flex flex-1 flex-col leading-tight">
          <span className="font-semibold">{triggerName}</span>
          <span className="text-xs text-muted-foreground">{triggerMeta}</span>
        </span>
        {loading ? <Spinner aria-hidden="true" /> : <span aria-hidden="true">▾</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-75" sideOffset={6}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[12.5px] font-bold tracking-wide">
            ORGANIZATIONS
          </DropdownMenuLabel>
          {status === "error" && (
            <div className="flex flex-col gap-2 px-2.5 py-2 text-sm">
              <p role="alert">Your organizations could not be loaded.</p>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry} className="self-start">
                  Try again
                </Button>
              )}
            </div>
          )}
          {status === "ready" &&
            orgs.map((org) => (
              <OrgRow
                key={org.id}
                org={org}
                active={org.id === activeOrgId}
                href={hrefFor(org)}
                renderLink={renderLink}
              />
            ))}
          {status === "ready" && orgs.length === 0 && (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">
              You are not in any organization.
            </p>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-secondary-foreground"
          render={(props) => renderLink({ ...props, href: settingsHref } as LinkProps)}
        >
          <span className="flex-1">Organization settings</span>
          <Shortcut keys={["G", "O"]} />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="font-semibold"
          render={(props) => renderLink({ ...props, href: createHref } as LinkProps)}
        >
          <PlusIcon />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
