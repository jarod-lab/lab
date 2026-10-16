import { cn } from "cn"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"
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
import { Kbd } from "../../components/ui/kbd"
import { type LinkProps, type RenderLink, useRenderLink } from "./link"

export type ThemeChoice = "light" | "dark" | "system"

export type UserMenuProps = {
  user: { name: string; email: string }
  theme: ThemeChoice
  onThemeChange: (theme: ThemeChoice) => void
  personalSettingsHref: string
  securityHref: string
  /** Opens the shortcut list. Omit to hide the item. */
  onShowShortcuts?: () => void
  onSignOut: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  renderLink?: RenderLink
  className?: string
}

/** First letter of the first two words: "Jordan Lee" -> "JL". */
export function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
  return letters.join("") || "?"
}

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

/** Account menu at the foot of the sidebar: personal settings, security, theme, shortcuts, sign out. */
export function UserMenu({
  user,
  theme,
  onThemeChange,
  personalSettingsHref,
  securityHref,
  onShowShortcuts,
  onSignOut,
  open,
  onOpenChange,
  renderLink: renderLinkProp,
  className,
}: UserMenuProps) {
  const renderLink = useRenderLink(renderLinkProp)
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label={`Account menu, ${user.name}`}
            className={cn(
              "h-12 w-full justify-start gap-2.5 rounded-none border-0 border-t border-border px-2 font-semibold",
              className,
            )}
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback className="text-xs">{initialsOf(user.name)}</AvatarFallback>
        </Avatar>
        <span className="flex-1 text-left">{user.name}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          ▴
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="w-70" sideOffset={6}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col py-2 text-sm leading-snug text-foreground">
            <span className="font-bold">{user.name}</span>
            <span className="text-[13px] font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={(props) => renderLink({ ...props, href: personalSettingsHref } as LinkProps)}
        >
          Personal settings
        </DropdownMenuItem>
        <DropdownMenuItem
          render={(props) => renderLink({ ...props, href: securityHref } as LinkProps)}
        >
          Security
        </DropdownMenuItem>
        {onShowShortcuts && (
          <DropdownMenuItem onClick={onShowShortcuts}>
            <span className="flex-1">Keyboard shortcuts</span>
            <Kbd>?</Kbd>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[12.5px] font-bold tracking-wide">
            THEME
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => onThemeChange(value as ThemeChoice)}
          >
            {THEMES.map((t) => (
              <DropdownMenuRadioItem key={t.value} value={t.value}>
                {t.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
