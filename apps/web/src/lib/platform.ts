/**
 * Which key the shortcuts display as the modifier. The palette binds both ⌘K and Ctrl+K, and the
 * keycaps should show the one the person actually has: ⌘ on Apple platforms, Ctrl everywhere else
 * (and when there is no navigator, as in server rendering).
 */
export type ModifierKeyLabel = "⌘" | "Ctrl"

export function isApplePlatform(
  nav: Pick<Navigator, "platform" | "userAgent"> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): boolean {
  if (!nav) return false
  return /\b(Mac|iPhone|iPad|iPod)/.test(`${nav.platform} ${nav.userAgent}`)
}

export function modifierKeyLabel(
  nav?: Pick<Navigator, "platform" | "userAgent">,
): ModifierKeyLabel {
  return isApplePlatform(nav ?? (typeof navigator === "undefined" ? undefined : navigator))
    ? "⌘"
    : "Ctrl"
}
