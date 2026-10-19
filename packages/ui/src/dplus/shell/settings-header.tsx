import { cn } from "cn"
import { type LinkProps, type RenderLink, useRenderLink } from "./link"
import { type PageTab, PageHeader, PageTabs } from "./page-header"
import { ViewOnlyNotice } from "./view-only-notice"

export type SettingsTab = PageTab

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
    <PageHeader
      title={title}
      context={context}
      className={className}
      actions={
        pills &&
        pills.length > 0 && (
          <nav aria-label={`${title} sub-sections`} className="flex gap-1.5">
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
        )
      }
    >
      {viewOnly && <ViewOnlyNotice subject={viewOnly} className="mb-1" />}
      <PageTabs
        label={`${title} sections`}
        tabs={tabs}
        activeTab={activeTab}
        renderLink={renderLinkProp}
      />
    </PageHeader>
  )
}
