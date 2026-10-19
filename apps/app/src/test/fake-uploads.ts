import { vi } from "vitest"

import type { UploadsApi } from "../lib/uploads-api"

/** An uploads API with uploads on (or `enabled: false`), recording every call. */
export function fakeUploads(
  overrides: Partial<UploadsApi> = {},
  { enabled = true }: { enabled?: boolean } = {},
): UploadsApi {
  return {
    limits: vi.fn(async () => ({
      enabled,
      maxBytes: 1024 * 1024,
      contentTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    })),
    setAvatar: vi.fn(async () => "https://files.example.com/user/u1/avatar-1.png"),
    removeAvatar: vi.fn(async () => undefined),
    setLogo: vi.fn(async () => "https://files.example.com/org/o1/logo-1.png"),
    removeLogo: vi.fn(async () => undefined),
    ...overrides,
  }
}
