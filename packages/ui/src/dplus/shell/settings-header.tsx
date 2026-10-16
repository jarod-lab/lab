import { cn } from "cn"
import { type LinkProps, type RenderLink, useRenderLink } from "./link"
import { ViewOnlyNotice } from "./view-only-notice"

export type SettingsTab = {
  id: string
  label: string
  href: string
  /** Quiet count after the label, e.g. "12". */
  count?: string
  /** Solar badge, e.g. "1 expired". */
  badge?: string
}

export type SettingsHeaderProps = {
  title: string
  /** Quiet line beside the title: "Acme Inc · you are Owner". */
  context?: string
  /** Level 1: horizontal tabs, ink underline on the current one. */
  tabs: SettingsTab[]
  activeTab: string
  /** Level 2: pills beside the title, for a sub-section. Keep to one level below the tabs. */
  pills?: { id: string; label: string; href: string }[]
  activePill?: string
  /** Set for a viewer: the name of what they can only look at. */
  viewOnly?: string
  renderLink?: RenderLink
  className?: string
}

/** Settings page header: title, context, level-2 pills and level-1 tabs. */
export function SettingsHeader({
  title,
  context,
  tabs,
  activeTab,
  pills,
  activePill,
  viewOnly,
  renderLink: renderLinkProp,
  className,
}: SettingsHeaderProps) {
  const renderLink = useRenderLink(renderLinkProp)
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 border-b border-border bg-background px-4 pt-5 md:px-9",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <h1 className="type-h1">{title}</h1>
        {context && <span className="text-sm text-muted-foreground">{context}</span>}
        {pills && pills.length > 0 && (
          <nav aria-label={`${title} sub-sections`} className="ml-auto flex gap-1.5">
            {pills.map((p) => {
              const current = p.id === activePill
              return (
                <span key={p.id}>
                  {renderLink({
                    href: p.href,
                    "aria-current": current ? "page" : undefined,
                    className: cn(
                      "inline-flex h-9 items-center rounded-full border-[1.5px] px-3.5 text-sm font-semibold",
                      current
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:bg-accent",
                    ),
                    children: p.label,
                  } as LinkProps)}
                </span>
              )
            })}
          </nav>
        )}
      </div>
      {viewOnly && <ViewOnlyNotice subject={viewOnly} className="mb-1" />}
      <nav aria-label={`${title} sections`} className="-mb-px overflow-x-auto">
        <ul className="flex gap-0.5">
          {tabs.map((t) => {
            const current = t.id === activeTab
            return (
              <li key={t.id}>
                {renderLink({
                  href: t.href,
                  "aria-current": current ? "page" : undefined,
                  className: cn(
                    "flex min-h-11 items-center gap-1.5 border-b-3 px-3 text-[15px] whitespace-nowrap",
                    current
                      ? "border-foreground font-bold text-foreground"
                      : "border-transparent text-secondary-foreground hover:text-foreground",
                  ),
                  children: (
                    <>
                      {t.label}
                      {t.count && (
                        <span className="text-[13px] font-normal text-muted-foreground">
                          {t.count}
                        </span>
                      )}
                      {t.badge && (
                        <span className="rounded-sm bg-solar px-1.5 text-xs font-extrabold text-solar-foreground">
                          {t.badge}
                        </span>
                      )}
                    </>
                  ),
                } as LinkProps)}
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
