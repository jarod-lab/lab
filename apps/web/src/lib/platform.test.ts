import { describe, expect, it } from "vitest"
import { isApplePlatform, modifierKeyLabel } from "./platform"

const nav = (platform: string, userAgent: string) => ({ platform, userAgent })

describe("modifierKeyLabel", () => {
  it("is ⌘ on Apple platforms", () => {
    expect(
      modifierKeyLabel(nav("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")),
    ).toBe("⌘")
    expect(
      modifierKeyLabel(nav("iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")),
    ).toBe("⌘")
    // iPadOS Safari reports a Mac platform in desktop mode.
    expect(isApplePlatform(nav("MacIntel", "Mozilla/5.0 (Macintosh)"))).toBe(true)
  })

  it("is Ctrl on Linux and Windows, including Chrome's AppleWebKit token", () => {
    expect(
      modifierKeyLabel(
        nav("Linux x86_64", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130"),
      ),
    ).toBe("Ctrl")
    expect(
      modifierKeyLabel(
        nav("Win32", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
      ),
    ).toBe("Ctrl")
  })

  it("is Ctrl without a navigator", () => {
    expect(isApplePlatform(undefined)).toBe(false)
    expect(modifierKeyLabel(undefined)).toBe("Ctrl")
  })

  it("reads the real navigator by default (jsdom is not Apple)", () => {
    expect(modifierKeyLabel()).toBe("Ctrl")
  })
})
