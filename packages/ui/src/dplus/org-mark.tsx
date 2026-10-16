import { cn } from "cn"
import type * as React from "react"

/**
 * An organization's letter mark (square, unlike a person's round Avatar). `filled` is an org you
 * own or are in now, `outline` another org, `personal` a personal workspace.
 */
function OrgMark({
  name,
  look = "filled",
  size = "default",
  className,
  ...props
}: {
  /** The organization's name; the mark shows its first letter. */
  name: string
  look?: "filled" | "outline" | "personal"
  size?: "sm" | "default" | "lg"
} & Omit<React.ComponentProps<"span">, "children">) {
  return (
    <span
      data-slot="org-mark"
      data-look={look}
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center font-extrabold",
        size === "sm" && "size-7 rounded-md text-sm",
        size === "default" && "size-7.5 rounded-md text-base",
        size === "lg" && "size-12 rounded-[10px] text-[22px]",
        look === "filled" && "bg-primary text-primary-foreground",
        look === "outline" && "border-[1.5px] border-foreground",
        look === "personal" &&
          "border-[1.5px] border-dashed border-muted-foreground text-muted-foreground",
        className,
      )}
      {...props}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  )
}

export { OrgMark }
