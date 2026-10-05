import type * as React from "react"
import { cn } from "../../index"

const variants = {
  default: "bg-primary text-primary-foreground hover:opacity-90",
  outline: "border border-foreground bg-background text-foreground hover:opacity-80",
} as const

const sizes = {
  sm: "h-8 px-3 text-sm",
  lg: "h-10 px-6 text-base",
} as const

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export function Button({ className, variant = "default", size = "sm", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
