import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-foreground p-0.5 transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive data-[size=default]:h-7 data-[size=default]:w-12 data-[size=sm]:h-5 data-[size=sm]:w-8.5 data-checked:bg-foreground data-unchecked:hatch data-disabled:cursor-not-allowed data-disabled:border-dashed data-disabled:border-muted-foreground",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full transition-transform group-data-[size=default]/switch:size-[18px] group-data-[size=sm]/switch:size-3 data-checked:translate-x-5 data-checked:bg-background group-data-[size=sm]/switch:data-checked:translate-x-3.5 data-unchecked:translate-x-0 data-unchecked:bg-foreground group-data-disabled/switch:bg-muted-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
