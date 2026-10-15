// Runs in <head> before first paint so a dark-mode visitor never sees the light page flash.
// The app keeps the class in sync with the OS setting afterwards (see __root.tsx).
;(function () {
  try {
    var dark = window.matchMedia("(prefers-color-scheme: dark)").matches
    document.documentElement.classList.toggle("dark", dark)
  } catch (error) {
    // No matchMedia: the page stays in light mode, as the effect in __root.tsx would leave it.
  }
})()
