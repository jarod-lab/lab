import { useState } from "react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../components/ui/command"
import { Shortcut } from "./shortcut"

export type PaletteItem = {
  id: string
  label: string
  /** Visible keycaps, e.g. ["G", "A"]. */
  shortcut?: string[]
}

export type PaletteGroup = { heading: string; items: PaletteItem[] }

export type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Navigate, actions, organizations: one group each. */
  groups: PaletteGroup[]
  /** Called with the item id, then the palette closes. */
  onSelect: (itemId: string) => void
  /** Called with what was typed (may be empty), then the palette closes. */
  onAskAgent: (query: string) => void
  placeholder?: string
}

const ASK_VALUE = "__ask-an-agent"

/** ⌘K palette: groups of items, and an "Ask an agent" entry that is always there. Controlled. */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  onSelect,
  onAskAgent,
  placeholder = "Search, or ask an agent",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("")

  const close = (next: boolean) => {
    if (!next) setQuery("")
    onOpenChange(next)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={close}
      title="Command palette"
      description="Search for a page, action or organization, or ask an agent."
    >
      <Command>
        <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>Nothing matches. Ask an agent instead.</CommandEmpty>
          {groups.map((g) => (
            <CommandGroup key={g.heading} heading={g.heading}>
              {g.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.id} ${item.label}`}
                  onSelect={() => {
                    close(false)
                    onSelect(item.id)
                  }}
                >
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && <Shortcut keys={item.shortcut} />}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="Agents">
            <CommandItem
              forceMount
              value={ASK_VALUE}
              onSelect={() => {
                const asked = query.trim()
                close(false)
                onAskAgent(asked)
              }}
            >
              <span className="flex-1 font-semibold">
                {query.trim() ? `Ask an agent: “${query.trim()}”` : "Ask an agent"}
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
