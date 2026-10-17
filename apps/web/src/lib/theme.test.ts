// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  THEME_STORAGE_KEY,
  applyTheme,
  isDark,
  readThemeChoice,
  setThemeChoice,
  toggledTheme,
} from "./theme"

/** Stubs matchMedia so "system" can be dark or light. */
function stubSystemDark(dark: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove("dark")
  stubSystemDark(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("theme choice", () => {
  it("is system when nothing is stored, and ignores unknown values", () => {
    expect(readThemeChoice()).toBe("system")
    window.localStorage.setItem(THEME_STORAGE_KEY, "neon")
    expect(readThemeChoice()).toBe("system")
  })

  it("reads a stored choice", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark")
    expect(readThemeChoice()).toBe("dark")
  })

  it("falls back to system when storage throws (private windows)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(readThemeChoice()).toBe("system")
  })

  it("still applies the choice when storage refuses to save it", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    setThemeChoice("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("persists and applies light, dark and system", () => {
    setThemeChoice("dark")
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    setThemeChoice("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)

    stubSystemDark(true)
    setThemeChoice("system")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("follows the OS only when the choice is system", () => {
    expect(isDark("system", true)).toBe(true)
    expect(isDark("system", false)).toBe(false)
    expect(isDark("light", true)).toBe(false)
    expect(isDark("dark", false)).toBe(true)
  })

  it("toggles to the opposite of what the page shows, resolving system from the OS", () => {
    expect(toggledTheme("light")).toBe("dark")
    expect(toggledTheme("dark")).toBe("light")
    stubSystemDark(true)
    expect(toggledTheme("system")).toBe("light")
    stubSystemDark(false)
    expect(toggledTheme("system")).toBe("dark")
  })

  it("applyTheme works without matchMedia (embedded webviews)", () => {
    // @ts-expect-error simulating an environment without matchMedia
    window.matchMedia = undefined
    applyTheme("system")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })
})

describe("src/theme-boot.js", () => {
  // The pre-paint script must read the same key and rule as the app (lib/theme.ts).
  // Vitest runs from the package root (apps/web).
  const script = readFileSync(resolve("src/theme-boot.js"), "utf8")

  it("reads the same storage key", () => {
    expect(script).toContain(`"${THEME_STORAGE_KEY}"`)
  })

  it("applies the choice before paint, following the OS for system", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark")
    stubSystemDark(false)
    new Function(script)()
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    window.localStorage.setItem(THEME_STORAGE_KEY, "light")
    stubSystemDark(true)
    new Function(script)()
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })
})

describe("useThemeSync during hydration", () => {
  it("keeps a stored dark choice when the OS is light (the hook's server snapshot is system)", async () => {
    const { hydrateRoot } = await import("react-dom/client")
    const { createElement, StrictMode } = await import("react")
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark")
    stubSystemDark(false)
    vi.resetModules()
    const theme = await import("./theme")
    // Dark is set before the app runs, as theme-boot.js does.
    document.documentElement.classList.add("dark")
    const seen: boolean[] = []
    const observer = new MutationObserver(() => {
      seen.push(document.documentElement.classList.contains("dark"))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    function Probe() {
      theme.useThemeSync()
      return null
    }
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = hydrateRoot(container, createElement(StrictMode, null, createElement(Probe)))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(seen.every((dark) => dark)).toBe(true)
    root.unmount()
    observer.disconnect()
    container.remove()
  })
})
