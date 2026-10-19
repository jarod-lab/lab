/** The logo strip. Placeholders until you have customers' permission to show their logos. */
export function Proof({ logos = 6 }: { logos?: number }) {
  return (
    <section id="customers" aria-label="Customers" className="scroll-mt-4 border-y">
      <div className="mx-auto flex max-w-300 flex-wrap items-center gap-7 px-6 py-7">
        <span className="min-w-40 text-sm text-muted-foreground">Used by teams at</span>
        <ul className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(min(120px,100%),1fr))] gap-3.5">
          {Array.from({ length: logos }, (_, i) => (
            <li
              // Placeholders have no identity but their position.
              key={i}
              className="grid min-h-10 place-items-center rounded-lg border-[1.5px] border-dashed border-muted-foreground text-[13px] font-bold text-muted-foreground"
            >
              [LOGO]
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
