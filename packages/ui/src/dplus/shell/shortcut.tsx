import { cn } from "cn"
import { Kbd, KbdGroup } from "../../components/ui/kbd"

/** Visible keyboard shortcut, e.g. `keys={["G", "H"]}`. Keys are shown; binding them is the app's job. */
export function Shortcut({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <KbdGroup className={cn("ml-auto", className)}>
      {keys.map((k, i) => (
        <Kbd key={`${i}-${k}`}>{k}</Kbd>
      ))}
    </KbdGroup>
  )
}
