import { cn } from "cn"
import type * as React from "react"
import { type LinkProps, type RenderLink, useRenderLink } from "./link"

export type PageHeaderProps = {
  title: string
  /** Quiet line beside the title: "Acme Inc · you are Owner". */
  context?: string
  /** Beside the title, pushed to the end of the row. */
  actions?: React.ReactNode
  /** Under the title row, e.g. tabs. Without it the band gets its own bottom padding. */
  children?: React.ReactNode
  className?: string
}

/** A page's header band: title and context on a bordered strip across the top of the page. */
export function PageHeader({ title, context, actions, children, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 border-b border-border bg-background px-4 pt-5 md:px-9",
        !children && "pb-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <h1 className="type-h1">{title}</h1>
        {context && <span className="text-sm text-muted-foreground">{context}</span>}
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export type PageTab = {
  id: string
  label: string
  href: string
  /** Quiet count after the label, e.g. "12". */
  count?: string
  /** Solar badge, e.g. "1 expired". */
  badge?: string
}

/** Horizontal tabs for the bottom of a PageHeader: links, with an ink underline on the current one. */
export function PageTabs({
  label,
  tabs,
  activeTab,
  renderLink: renderLinkProp,
}: {
  /** The nav's accessible name, e.g. "Organization settings sections". */
  label: string
  tabs: PageTab[]
  activeTab: string
  renderLink?: RenderLink
}) {
  const renderLink = useRenderLink(renderLinkProp)
  return (
    <nav aria-label={label} className="-mb-px overflow-x-auto">
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
  )
}

/** The content under a PageHeader. One width for every page, so moving between them doesn't jump. */
export function PageBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex max-w-[960px] flex-col gap-5 px-4 py-6 md:px-9", className)}
      {...props}
    />
  )
}
