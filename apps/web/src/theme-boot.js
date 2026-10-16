// Runs in <head> before first paint so a dark-mode visitor never sees the light page flash.
// The key and the rule match src/lib/theme.ts (THEME_STORAGE_KEY, isDark): keep them in step.
// The app keeps the class in sync afterwards (useThemeSync in __root.tsx).
;(function () {
  try {
    var choice = "system"
    try {
      var stored = window.localStorage.getItem("starter.theme")
      if (stored === "light" || stored === "dark" || stored === "system") choice = stored
    } catch {
      // Storage blocked: follow the OS setting.
    }
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    var dark = choice === "dark" || (choice === "system" && prefersDark)
    document.documentElement.classList.toggle("dark", dark)
  } catch {
    // No matchMedia: the page stays in light mode.
  }
})()
