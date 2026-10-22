// Loaded only in dev (see routes/__root.tsx). Nothing here is imported by the production bundle.
import { useRouter } from "@tanstack/react-router"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools"
import { hotkeysDevtoolsPlugin } from "@tanstack/react-hotkeys-devtools"
import { pacerDevtoolsPlugin } from "@tanstack/react-pacer-devtools"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

// At phone width the trigger (fixed to the bottom-right corner) covers the composer's Send and the
// widget's Submit ticket, so CSS hides it there. Not the `triggerHidden` config: the core saves its
// settings in local storage and those override config, so a phone value would stick on desktop.
// The panel still opens with its hotkey, Ctrl+~. The selector is the core's own trigger button.
const HIDE_TRIGGER_ON_PHONE = `@media (max-width: 639px) {
  [data-tsd-control][aria-label^="Open TanStack Devtools"] { display: none !important; }
}`

export default function AppDevtools() {
  const router = useRouter()
  return (
    <>
      <style>{HIDE_TRIGGER_ON_PHONE}</style>
      <TanStackDevtools
        plugins={[
          { name: "TanStack Router", render: <TanStackRouterDevtoolsPanel router={router} /> },
          { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
          formDevtoolsPlugin(),
          pacerDevtoolsPlugin(),
          hotkeysDevtoolsPlugin(),
        ]}
      />
    </>
  )
}
