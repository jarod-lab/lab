import type { ReactNode } from "react"

/**
 * The shell: sidebar beside the main panel. Fluid, not breakpointed: when the two do not fit on
 * one line (a phone) the sidebar sits above the panel and takes the full width.
 */
export function AppFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap bg-background text-foreground">
      <div className="flex-[1_0_232px]">{sidebar}</div>
      <main className="min-w-0 flex-[999_1_560px] p-3 sm:p-4">
        <div className="flex flex-col gap-5 rounded-shell border border-border bg-panel p-4 sm:p-[22px_24px]">
          {children}
        </div>
      </main>
    </div>
  )
}
