import { useHotkeys } from "@tanstack/react-hotkeys"

export type ShellHotkeyActions = {
  /** Paths for the G-sequences, or null when there is no organization to go to. */
  homeHref: string | null
  agentsHref: string | null
  settingsHref: string | null
  onOpenPalette: () => void
  onOpenShortcuts: () => void
  onToggleTheme: () => void
  onSystemTheme: () => void
  onGo: (href: string) => void
}

/**
 * The shell's keys. G then H/A/O go to a page. ⌘K and Ctrl+K open the palette (Ctrl+K too, since
 * ⌘ is Mac-only and Mod would be Ctrl elsewhere). `?` opens the shortcut list. D toggles light and dark,
 * Shift+D goes back to the system theme. Sequences, D, Shift+D and `?` ignore typing in inputs; the palette key works everywhere, as a shortcut should.
 */
export function useShellHotkeys(actions: ShellHotkeyActions) {
  const go = (href: string | null) => () => {
    if (href) actions.onGo(href)
  }
  useHotkeys([
    { hotkey: ["G", "H"], callback: go(actions.homeHref), options: { ignoreInputs: true } },
    { hotkey: ["G", "A"], callback: go(actions.agentsHref), options: { ignoreInputs: true } },
    { hotkey: ["G", "O"], callback: go(actions.settingsHref), options: { ignoreInputs: true } },
    {
      hotkey: "Meta+K",
      callback: () => actions.onOpenPalette(),
      options: { preventDefault: true },
    },
    {
      hotkey: "Control+K",
      callback: () => actions.onOpenPalette(),
      options: { preventDefault: true },
    },
    { hotkey: "D", callback: () => actions.onToggleTheme(), options: { ignoreInputs: true } },
    {
      hotkey: "Shift+D",
      callback: () => actions.onSystemTheme(),
      options: { ignoreInputs: true },
    },
    { hotkey: "?", callback: () => actions.onOpenShortcuts(), options: { ignoreInputs: true } },
  ])
}
