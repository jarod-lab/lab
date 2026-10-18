import { cn } from "cn"
import { useEffect, useId, useState } from "react"
import { Button } from "../../components/ui/button"

type CopyState = "idle" | "copied" | "failed"

/** A value you can copy, in mono, with a Copy button that says Copied for a moment. */
export function CopyField({
  label,
  value,
  onCopy,
  className,
}: {
  label: string
  value: string
  /** Called after a successful copy. */
  onCopy?: (value: string) => void
  className?: string
}) {
  const id = useId()
  const [state, setState] = useState<CopyState>("idle")

  useEffect(() => {
    if (state === "idle") return
    const timer = setTimeout(() => setState("idle"), 2000)
    return () => clearTimeout(timer)
  }, [state])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setState("copied")
      onCopy?.(value)
    } catch {
      setState("failed")
    }
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <label htmlFor={id} className="mb-1 text-sm leading-normal font-semibold">
        {label}
      </label>
      <div className="flex min-h-11 items-stretch overflow-hidden rounded-lg border-[1.5px] border-input">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="type-mono min-w-0 flex-1 bg-transparent px-3 text-foreground"
        />
        <Button
          variant="outline"
          onClick={copy}
          className="h-auto rounded-none border-0 border-l-[1.5px] border-input px-4"
        >
          {state === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <output className="text-sm text-muted-foreground not-empty:mt-1">
        {state === "copied" && "Copied to clipboard."}
        {state === "failed" && "Could not copy. Select the value and copy it yourself."}
      </output>
    </div>
  )
}
