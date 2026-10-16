import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border-[1.5px] border-transparent px-2.5 text-xs font-bold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/85",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-accent",
        destructive: "border-destructive text-destructive [a]:hover:bg-destructive/10",
        outline: "border-foreground text-foreground [a]:hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "text-foreground underline underline-offset-3 hover:decoration-2",
        solar: "rounded-sm bg-solar text-solar-foreground [a]:hover:bg-solar/85",
        success: "border-success text-success",
      },
      size: {
        default: "",
        sm: "h-5 px-1.5 text-[11.5px] font-extrabold tracking-wide",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Badge({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
