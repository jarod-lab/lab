/** One customer quote. Every field is a placeholder: use a real customer's words, with a number. */
export function Testimonial() {
  return (
    <section aria-label="Customer story" className="border-y">
      <figure className="mx-auto flex max-w-230 flex-col gap-5.5 px-6 py-22">
        <blockquote className="text-[clamp(24px,3vw,34px)] leading-tight font-extrabold tracking-[-0.02em] text-balance">
          “[Customer quote about a specific outcome —{" "}
          <span className="highlight px-0.75">what changed, with a number</span> — in their own
          words.]”
        </blockquote>
        <figcaption className="flex flex-wrap items-center gap-3.5">
          <span
            aria-hidden="true"
            className="size-11 rounded-full border-2 border-dashed border-muted-foreground"
          />
          <span className="flex flex-col leading-snug">
            <strong>[Name]</strong>
            <span className="text-[15px] text-muted-foreground">[Role], [Company]</span>
          </span>
          <a
            href="/blog/category/customers"
            className="ml-auto font-semibold underline underline-offset-3"
          >
            Read the case study
          </a>
        </figcaption>
      </figure>
    </section>
  )
}
