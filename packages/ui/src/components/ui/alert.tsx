import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const alertVariants = cva(
  "group/alert relative grid w-full gap-1 rounded-xl bg-background px-4 py-3 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border border-border bg-card text-card-foreground",
        destructive:
          "border-2 border-destructive bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current",
        outline: "border-2 border-foreground bg-transparent text-foreground",
        notice:
          "border-2 border-dashed border-foreground text-foreground *:data-[slot=alert-description]:text-secondary-foreground",
        attention:
          "border-0 bg-solar px-5 py-4 text-solar-foreground [--accent:color-mix(in_oklab,var(--solar-foreground)_12%,transparent)] [--accent-foreground:var(--solar-foreground)] [--foreground:var(--solar-foreground)] [--primary-foreground:var(--solar)] [--primary:var(--solar-foreground)] [--ring:var(--solar-foreground)] *:data-[slot=alert-description]:text-solar-foreground",
        inverse:
          "border-0 bg-primary text-primary-foreground [--accent:color-mix(in_oklab,var(--primary-foreground)_15%,transparent)] [--accent-foreground:var(--primary-foreground)] [--foreground:var(--primary-foreground)] [--ring:var(--primary-foreground)] *:data-[slot=alert-description]:text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "text-sm font-bold group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className,
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2.5 right-3", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
