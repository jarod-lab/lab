import { cn } from "cn"
import { BellIcon } from "lucide-react"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../../components/ui/empty"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"

export type NotificationTab = "unread" | "all"

export type NotificationItem = {
  id: string
  title: string
  body?: string | null
  createdAt: Date | string
  read: boolean
  /** The organization's name, when the notification belongs to one. Personal notices have none. */
  organizationName?: string | null
}

export type NotificationsMenuProps = {
  items: NotificationItem[]
  unreadCount: number
  tab: NotificationTab
  onTabChange: (tab: NotificationTab) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** A row was chosen. The container navigates and marks it read. */
  onSelect: (item: NotificationItem) => void
  /** Hides "Mark all read" when the session can't write (an impersonated session). Default true. */
  canMarkAllRead?: boolean
  onMarkAllRead: () => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  /** The first page is still loading. */
  loading?: boolean
  /** The list could not be loaded. */
  failed?: boolean
  /** The clock for the relative times. Defaults to now. */
  now?: Date
  className?: string
}

const MAX_BADGE = 99

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function relativeTime(value: Date | string, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date)
}

/** The bell's accessible name: "Notifications, 3 unread", or "Notifications, nothing unread". */
export function notificationsLabel(unreadCount: number): string {
  if (unreadCount <= 0) return "Notifications, nothing unread"
  return `Notifications, ${unreadCount} unread`
}

/**
 * Notifications bell for the top bar: a count badge on the trigger, and a popover with Unread and
 * All tabs, a Mark all read action and a load-more row. Presentational: the rows, counts and
 * callbacks come in as props.
 */
export function NotificationsMenu({
  items,
  unreadCount,
  tab,
  onTabChange,
  open,
  onOpenChange,
  onSelect,
  canMarkAllRead = true,
  onMarkAllRead,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loading = false,
  failed = false,
  now,
  className,
}: NotificationsMenuProps) {
  const clock = now ?? new Date()
  const badge = unreadCount > MAX_BADGE ? `${MAX_BADGE}+` : String(unreadCount)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={notificationsLabel(unreadCount)}
            className={cn(
              "relative size-11 border border-border text-muted-foreground sm:size-10",
              className,
            )}
          />
        }
      >
        <BellIcon aria-hidden="true" />
        {unreadCount > 0 && (
          <Badge
            variant="default"
            aria-hidden="true"
            className="absolute -top-2 -right-2 h-5 min-w-5 rounded-md border-2 border-background px-1 text-[11.5px] font-extrabold"
          >
            {badge}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent
        aria-label="Notifications"
        align="end"
        sideOffset={6}
        className="w-[min(calc(100vw-1.5rem),24rem)] gap-0 p-0"
      >
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Tabs
            value={tab}
            onValueChange={(value) => onTabChange(value as NotificationTab)}
            className="min-w-0 flex-1"
          >
            <TabsList className="w-full">
              <TabsTrigger value="unread">Unread</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          {canMarkAllRead && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
              className="shrink-0"
            >
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
          {loading ? (
            <output className="block p-6 text-center text-sm text-muted-foreground">
              Loading notifications…
            </output>
          ) : failed ? (
            <p role="alert" className="p-6 text-center text-sm text-destructive">
              Could not load notifications. They will refresh on their own.
            </p>
          ) : items.length === 0 ? (
            <Empty className="p-6">
              <EmptyHeader>
                <EmptyTitle>
                  {tab === "unread" ? "You're all caught up" : "No notifications yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {tab === "unread"
                    ? "Nothing new has come in."
                    : "Approvals, run results and account changes show up here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul aria-label="Notifications list" className="flex flex-col p-1.5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.read ? (
                      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0" />
                    ) : (
                      <>
                        <span className="sr-only">Unread: </span>
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                        />
                      </>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className={cn(
                          "truncate text-sm text-foreground",
                          item.read ? "font-normal" : "font-bold",
                        )}
                      >
                        {item.title}
                      </span>
                      {item.body && (
                        <span className="line-clamp-2 text-[13px] text-muted-foreground">
                          {item.body}
                        </span>
                      )}
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        {item.organizationName && (
                          <span className="truncate font-semibold">{item.organizationName}</span>
                        )}
                        {item.organizationName && <span aria-hidden="true">·</span>}
                        <time
                          dateTime={new Date(item.createdAt).toISOString()}
                          className="shrink-0"
                        >
                          {relativeTime(item.createdAt, clock)}
                        </time>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {hasMore && onLoadMore && (
          <div className="border-t border-border p-2">
            <Button variant="ghost" className="w-full" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
