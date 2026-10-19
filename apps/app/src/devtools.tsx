// Loaded only in dev (see routes/__root.tsx). Nothing here is imported by the production bundle.
import { useRouter } from "@tanstack/react-router"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools"
import { hotkeysDevtoolsPlugin } from "@tanstack/react-hotkeys-devtools"
import { pacerDevtoolsPlugin } from "@tanstack/react-pacer-devtools"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

export default function AppDevtools() {
  const router = useRouter()
  return (
    <TanStackDevtools
      plugins={[
        { name: "TanStack Router", render: <TanStackRouterDevtoolsPanel router={router} /> },
        { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
        formDevtoolsPlugin(),
        pacerDevtoolsPlugin(),
        hotkeysDevtoolsPlugin(),
      ]}
    />
  )
}
