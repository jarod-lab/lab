import { site } from "../site"

/** The square mark and the product name, linking home. The name is the link's accessible name. */
export function Logo() {
  return (
    <a href="/" className="flex items-center gap-2.5 text-foreground">
      <span
        aria-hidden="true"
        className="grid size-7.5 place-items-center rounded-[7px] bg-foreground text-[15px] font-extrabold text-background"
      >
        {site.mark}
      </span>
      <span className="text-[17px] font-extrabold tracking-tight">{site.name}</span>
    </a>
  )
}
