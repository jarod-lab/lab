import axe from "axe-core"

/**
 * Rules that need a real browser (layout, colour) or only make sense for a whole page. Component
 * markup is rendered as a fragment in jsdom, so these would be noise or false results.
 */
const FRAGMENT_UNSAFE_RULES = [
  "color-contrast",
  "region",
  "landmark-one-main",
  "page-has-heading-one",
  "landmark-no-duplicate-banner",
  "landmark-no-duplicate-contentinfo",
  "landmark-no-duplicate-main",
  "document-title",
  "html-has-lang",
  "scrollable-region-focusable",
]

export interface A11yViolation {
  rule: string
  impact: string | null | undefined
  help: string
  targets: string[]
}

/**
 * Run axe against server-rendered markup. Needs a DOM: add `// @vitest-environment jsdom` to the
 * test file. Returns the violations; use `expectNoA11yViolations` to assert.
 */
export async function checkA11y(html: string): Promise<A11yViolation[]> {
  document.body.replaceChildren(document.createRange().createContextualFragment(html))
  try {
    const results = await axe.run(document.body, {
      rules: Object.fromEntries(FRAGMENT_UNSAFE_RULES.map((id) => [id, { enabled: false }])),
    })
    return results.violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(" ")),
    }))
  } finally {
    document.body.replaceChildren()
  }
}

/** Throws, listing every violation, if the markup has any. */
export async function expectNoA11yViolations(html: string): Promise<void> {
  const violations = await checkA11y(html)
  if (violations.length === 0) return
  const lines = violations.map(
    (v) => `- ${v.rule} (${v.impact ?? "unknown"}): ${v.help}\n    ${v.targets.join("\n    ")}`,
  )
  throw new Error(`${violations.length} accessibility violation(s):\n${lines.join("\n")}`)
}
