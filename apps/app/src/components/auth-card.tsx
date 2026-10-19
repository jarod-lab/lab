import type { ReactNode } from "react"

import { FormError } from "./form"

/**
 * The centred card every public page sits in (D+ Auth board): a mark, one heading, the page body and
 * optional footer links. Tokens only, so dark mode follows the theme.
 */
export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string
  description?: string
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <section className="flex w-full max-w-[400px] flex-col gap-4 rounded-[14px] border border-border bg-card p-7 text-card-foreground">
        <span
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-lg bg-foreground text-lg font-extrabold text-background"
        >
          A
        </span>
        <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.02em]">{title}</h1>
        {description ? <p className="text-[15px] text-muted-foreground">{description}</p> : null}
        {children}
        {footer ? <div className="mt-auto text-sm text-muted-foreground">{footer}</div> : null}
      </section>
    </main>
  )
}

/** A failure the person can act on. Renders nothing without a message. */
export function ErrorAlert({ message }: { message: string | null }) {
  return <FormError title="Something went wrong" message={message} />
}
