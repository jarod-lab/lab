import { cn } from "cn"
import type { ReactNode } from "react"

import { site } from "../site"
import type { TocItem } from "./blog/post-page"

/** A legal document: header with the document tabs, numbered sections beside the text. */
export function LegalPage({
  title,
  effective,
  updated,
  summary,
  tabs,
  current,
  sections,
  children,
}: {
  title: string
  effective: string
  updated: string
  /** "The short version" bullets. Empty, the box is left out. */
  summary: string[]
  tabs: { slug: string; label: string }[]
  current: string
  sections: TocItem[]
  children: ReactNode
}) {
  return (
    <>
      <div className="border-b">
        <div className="mx-auto flex max-w-300 flex-col gap-3.5 px-6 pt-12">
          <span className="type-eyebrow text-muted-foreground">LEGAL</span>
          <h1 className="text-[clamp(34px,4.4vw,50px)] leading-[1.05] font-extrabold tracking-[-0.035em]">
            {title}
          </h1>
          <p className="text-[15px] text-secondary-foreground">
            Effective {effective} · Last updated {updated}
          </p>
          <nav aria-label="Legal documents" className="mt-2">
            <ul className="-mb-px flex gap-0.5 overflow-x-auto">
              {tabs.map((tab) => {
                const on = tab.slug === current
                return (
                  <li key={tab.slug}>
                    <a
                      href={`/legal/${tab.slug}`}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center border-b-[3px] border-transparent px-3 text-[15.5px] whitespace-nowrap text-secondary-foreground hover:text-foreground",
                        on && "border-foreground font-bold text-foreground",
                      )}
                    >
                      {tab.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      </div>

      <div className="mx-auto flex max-w-300 flex-wrap items-start gap-14 px-6 pt-10 pb-20 text-[17px] leading-[1.65]">
        {sections.length > 0 && (
          <nav
            aria-label="Sections"
            className="flex max-w-65 flex-[1_1_200px] flex-col border-t-[3px] border-foreground pt-3.5 text-[15px] md:sticky md:top-6"
          >
            <span className="mb-1.5 type-eyebrow text-muted-foreground">SECTIONS</span>
            <ol>
              {sections.map((s, i) => (
                <li key={s.slug}>
                  <a
                    href={`#${s.slug}`}
                    className="flex min-h-8.5 items-center gap-2 text-secondary-foreground hover:text-foreground"
                  >
                    <span aria-hidden="true" className="w-5 text-muted-foreground">
                      {i + 1}
                    </span>
                    {s.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <article className="flex max-w-180 min-w-0 flex-[999_1_560px] flex-col gap-7">
          {summary.length > 0 && (
            <section
              aria-labelledby="short-h"
              className="flex flex-col gap-2.5 rounded-[14px] border-2 border-foreground px-5.5 py-5"
            >
              <h2 id="short-h" className="text-xl font-extrabold">
                The short version
              </h2>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-secondary-foreground">
                {summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                This summary is for convenience. The full text below is what applies.
              </p>
            </section>
          )}
          <div className="legal-body">{children}</div>
          <section
            aria-labelledby="contact-h"
            className="flex flex-col gap-1.5 rounded-[14px] bg-secondary px-5.5 py-5"
          >
            <h2 id="contact-h" className="text-xl font-extrabold">
              Questions about this document?
            </h2>
            <p className="text-secondary-foreground">
              Email{" "}
              <a href={`mailto:${site.legalEmail}`} className="text-foreground underline">
                {site.legalEmail}
              </a>{" "}
              or write to {site.company}, [Address].
            </p>
          </section>
        </article>
      </div>
    </>
  )
}
