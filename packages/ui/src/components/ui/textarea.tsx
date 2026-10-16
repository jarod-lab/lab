import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full resize-none rounded-lg border-[1.5px] border-input bg-transparent px-3 py-2.5 text-base text-foreground transition-[color,border-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-2 focus-visible:border-ring focus-visible:px-[calc(--spacing(3)-0.5px)] focus-visible:py-[calc(--spacing(2.5)-0.5px)] disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted-foreground aria-invalid:border-2 aria-invalid:border-destructive md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
