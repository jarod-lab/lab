import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border-[1.5px] border-input bg-transparent px-3 py-1 text-base text-foreground transition-[color,border-color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground placeholder:text-muted-foreground focus-visible:border-2 focus-visible:border-ring focus-visible:px-[calc(--spacing(3)-0.5px)] disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted-foreground aria-invalid:border-2 aria-invalid:border-destructive md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
