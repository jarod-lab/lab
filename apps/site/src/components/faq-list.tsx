import type { ReactNode } from "react"

import type { Faq } from "../data/faqs"

/** Native disclosure rows: they open and close without JavaScript. The first starts open. */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="border-t">
      {faqs.map((faq, i) => (
        <details key={faq.q} open={i === 0} className="group border-b py-1">
          <summary className="flex min-h-13 cursor-pointer list-none items-center gap-3 text-lg font-bold [&::-webkit-details-marker]:hidden">
            <span className="flex-1">{faq.q}</span>
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform group-open:rotate-45"
            >
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </summary>
          <p className="mb-4 max-w-180 text-secondary-foreground">{faq.a}</p>
        </details>
      ))}
    </div>
  )
}

/** A titled FAQ block, with room for a closing line under the list. */
export function FaqSection({
  id,
  title,
  faqs,
  children,
}: {
  id: string
  title: string
  faqs: Faq[]
  children?: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="mx-auto flex max-w-220 flex-col gap-6 px-6 py-22">
      <h2 id={id} className="type-section">
        {title}
      </h2>
      <FaqList faqs={faqs} />
      {children}
    </section>
  )
}
