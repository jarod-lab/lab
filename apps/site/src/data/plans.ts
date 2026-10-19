import { site } from "../site"

/**
 * The plans the pricing page and the home page teaser show. Prices are placeholders: fill them in
 * from your billing setup (STRIPE_PLANS in the API) rather than inventing numbers.
 */
export interface Plan {
  name: string
  blurb: string
  /** What the home page teaser says under the price. */
  summary: string
  price: { monthly: string; annual: string }
  /** After the price: "forever", "/ seat / month". */
  unit: string
  cta: { label: string; href: string }
  featured?: boolean
  items: string[]
}

export const plans: Plan[] = [
  {
    name: "Free",
    blurb: "For trying agents with a small team.",
    summary: "3 seats · 2 agents",
    price: { monthly: "[PRICE]", annual: "[PRICE]" },
    unit: "forever",
    cta: { label: "Start free", href: site.signUpUrl },
    items: [
      "3 seats",
      "2 agents",
      "Approvals and run history (30 days)",
      "Passkeys and two-factor",
      "Community support",
    ],
  },
  {
    name: "Pro",
    blurb: "For teams putting agents to daily work.",
    summary: "Up to 25 seats · unlimited agents · API keys",
    price: { monthly: "[PRICE]", annual: "[PRICE]" },
    unit: "/ seat / month",
    cta: { label: "Start [14]-day trial", href: site.signUpUrl },
    featured: true,
    items: [
      "Up to 25 seats, viewers free",
      "Unlimited agents",
      "Run history (1 year)",
      "Org API keys",
      "Budgets and footprint reports",
      "Email support",
    ],
  },
  {
    name: "Team",
    blurb: "For larger teams with security reviews.",
    summary: "SSO · audit log · custom roles",
    price: { monthly: "[PRICE]", annual: "[PRICE]" },
    unit: "/ seat / month",
    cta: { label: "Talk to us", href: `mailto:${site.contactEmail}` },
    items: [
      "Unlimited seats",
      "Everything in Pro",
      "SSO (SAML) and audit log export",
      "Custom roles",
      "Priority support",
    ],
  },
]

/** A cell in the comparison table: included, not included, or a value. */
export type Cell = boolean | string

export const comparison: { group: string; rows: { label: string; cells: Cell[] }[] }[] = [
  {
    group: "AGENTS AND RUNS",
    rows: [
      { label: "Agents", cells: ["2", "Unlimited", "Unlimited"] },
      { label: "Run history", cells: ["30 days", "1 year", "Custom"] },
      { label: "Approvals and undo", cells: [true, true, true] },
      { label: "Budgets and footprint reports", cells: [false, true, true] },
    ],
  },
  {
    group: "COLLABORATION",
    rows: [
      { label: "Seats", cells: ["3", "Up to 25", "Unlimited"] },
      { label: "Viewer role", cells: [true, "Free", "Free"] },
      { label: "Custom roles", cells: [false, false, true] },
    ],
  },
  {
    group: "SECURITY",
    rows: [
      { label: "Passkeys, two-factor, breach checks", cells: [true, true, true] },
      { label: "Org API keys", cells: [false, true, true] },
      { label: "SAML SSO, audit log export", cells: [false, false, true] },
    ],
  },
  {
    group: "SUPPORT",
    rows: [{ label: "Support", cells: ["Community", "Email", "Priority"] }],
  },
]
