import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@starter/ui/components/ui/dialog"
import { Shortcut } from "@starter/ui/dplus/shell/shortcut"

/** The `?` list: every key the shell binds, shown with the same keycaps the palette uses. */
export const SHELL_SHORTCUTS: Array<{ label: string; keys: string[] }> = [
  { label: "Go to home", keys: ["G", "H"] },
  { label: "Go to agents", keys: ["G", "A"] },
  { label: "Go to organization settings", keys: ["G", "O"] },
  { label: "Open the command palette", keys: ["⌘", "K"] },
  { label: "Open the command palette (Windows and Linux)", keys: ["Ctrl", "K"] },
  { label: "Show this list", keys: ["?"] },
]

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts don't fire while you are typing in a field.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {SHELL_SHORTCUTS.map((shortcut) => (
            <li key={shortcut.label} className="flex items-center justify-between gap-4">
              <span>{shortcut.label}</span>
              <Shortcut keys={shortcut.keys} />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
