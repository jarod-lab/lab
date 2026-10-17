import { describe, expect, it } from "vitest"

import {
  dateLabel,
  deviceLabel,
  initialsOf,
  isOwnerRole,
  personalSlugOf,
  relativeTime,
  signInMethodLabel,
} from "./account-format"

const NOW = Date.parse("2026-10-16T12:00:00Z")
const DAY = 86_400_000

describe("initialsOf", () => {
  it("takes the first and last word's letters, in capitals", () => {
    expect(initialsOf("jordan lee")).toBe("JL")
    expect(initialsOf("Ada Byron King")).toBe("AK")
    expect(initialsOf("Cher")).toBe("C")
  })

  it("falls back to the email, then a question mark", () => {
    expect(initialsOf("  ", "ada@example.com")).toBe("A")
    expect(initialsOf("", "")).toBe("?")
  })
})

describe("relativeTime", () => {
  it("says how long ago, in words", () => {
    expect(relativeTime(new Date(NOW - 2 * DAY).toISOString(), NOW)).toBe("2 days ago")
    expect(relativeTime(new Date(NOW - 3 * 30 * DAY).toISOString(), NOW)).toBe("3 months ago")
    expect(relativeTime(new Date(NOW - DAY).toISOString(), NOW)).toBe("yesterday")
    expect(relativeTime(new Date(NOW - 5_000).toISOString(), NOW)).toBe("just now")
  })

  it("never reads a past time as future when the browser clock is behind the server", () => {
    expect(relativeTime(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe("just now")
    expect(relativeTime(new Date(NOW + 30_000).toISOString(), NOW)).toBe("just now")
  })

  it("is empty without a usable date", () => {
    expect(relativeTime(null, NOW)).toBe("")
    expect(relativeTime("not a date", NOW)).toBe("")
  })
})

describe("dateLabel", () => {
  it("formats a date for a person, and is empty without one", () => {
    expect(dateLabel("2026-09-02T10:00:00Z")).toMatch(/Sep 2, 2026|Sep 1, 2026/)
    expect(dateLabel(null)).toBe("")
  })
})

describe("deviceLabel", () => {
  it("names the browser and the system from a user agent", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      ),
    ).toBe("Safari on macOS")
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      ),
    ).toBe("Chrome on Windows")
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0",
      ),
    ).toBe("Edge on Windows")
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iPhone")
    expect(
      deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"),
    ).toBe("Firefox on Linux")
  })

  it("names the browsers that carry their own token on iOS and Android", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Chrome on iPhone")
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
      ),
    ).toBe("Firefox on iPhone")
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/126.0.2592.61 Mobile/15E148 Safari/605.1.15",
      ),
    ).toBe("Edge on iPhone")
    expect(
      deviceLabel(
        "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.2592.46",
      ),
    ).toBe("Edge on Android")
  })

  it("says what it can, or that the device is unknown", () => {
    expect(deviceLabel("curl/8.0")).toBe("Unknown device")
    expect(deviceLabel(null)).toBe("Unknown device")
    expect(deviceLabel("Something Linux/1.0")).toBe("Linux")
  })
})

describe("signInMethodLabel", () => {
  it("words the method, with two-factor when the step was taken", () => {
    expect(signInMethodLabel("passkey", false)).toBe("passkey")
    expect(signInMethodLabel("github", true)).toBe("GitHub and two-factor")
    expect(signInMethodLabel("email", false)).toBe("email and password")
    expect(signInMethodLabel("email", true)).toBe("email, password and two-factor")
    expect(signInMethodLabel("custom-thing", false)).toBe("custom-thing")
  })

  it("is null for a session that predates the record", () => {
    expect(signInMethodLabel(null, false)).toBeNull()
  })
})

describe("roles and slugs", () => {
  it("finds the owner role in a comma-separated role string", () => {
    expect(isOwnerRole("owner")).toBe(true)
    expect(isOwnerRole("admin, owner")).toBe(true)
    expect(isOwnerRole("admin,member")).toBe(false)
    expect(isOwnerRole("")).toBe(false)
  })

  it("names the personal organization's slug as the server does", () => {
    expect(personalSlugOf("User-ABC")).toBe("personal-user-abc")
  })
})
