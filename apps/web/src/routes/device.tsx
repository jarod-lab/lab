import { createFileRoute } from "@tanstack/react-router"

import { DevicePage } from "../pages/device-page"
import { getWebAuth } from "../lib/web-auth"

// better-auth's verification URI for the device grant (`/device`), with the code prefilled.
export const Route = createFileRoute("/device")({
  validateSearch: (search: Record<string, unknown>) => ({
    user_code: typeof search.user_code === "string" ? search.user_code : undefined,
  }),
  component: DeviceRoute,
})

function DeviceRoute() {
  const { user_code } = Route.useSearch()
  return <DevicePage auth={getWebAuth()} initialUserCode={user_code} />
}
