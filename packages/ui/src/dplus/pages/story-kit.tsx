import type * as React from "react"

// Story-only layout helpers for the "Variants" stories: one labelled row per variant, so every
// option of a component can be checked against the D+ design system page at a glance.

export function VariantTable({
  columns,
  children,
}: {
  columns?: string[]
  children: React.ReactNode
}) {
  return (
    <div
      className="grid items-center gap-x-6 gap-y-4 bg-background p-6 text-foreground"
      style={{ gridTemplateColumns: `9rem repeat(${columns?.length ?? 1}, max-content)` }}
    >
      {columns && (
        <>
          <span />
          {columns.map((c) => (
            <span key={c} className="type-eyebrow text-muted-foreground">
              {c}
            </span>
          ))}
        </>
      )}
      {children}
    </div>
  )
}

export function VariantRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <>
      <code className="type-mono text-muted-foreground">{name}</code>
      {children}
    </>
  )
}

export function Stack({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex max-w-xl flex-col gap-4 bg-background p-6 text-foreground ${className ?? ""}`}
    >
      {children}
    </div>
  )
}
