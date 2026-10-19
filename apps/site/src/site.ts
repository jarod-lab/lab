import { APP_URL } from "astro:env/client"

/**
 * The marketing site's names and links, in one place. Bracketed values are placeholders the design
 * leaves for you to fill in: replace them before publishing rather than inventing facts.
 */
export const site = {
  name: "[Product]",
  /** The letter in the square logo mark. */
  mark: "P",
  company: "[Company]",
  tagline: "Agents that do the busywork and wait for your yes.",
  description:
    "[Product] runs your repetitive work as agents that show every step and ask before anything " +
    "leaves your workspace.",
  /** The announcement bar above the header. Set to null to hide it. */
  announcement: {
    label: "New",
    text: "Agents can now open pull requests for review",
    cta: "Read the post",
    href: "/blog/agents-open-pull-requests",
  } as { label: string; text: string; cta: string; href: string } | null,
  signInUrl: new URL("/sign-in", APP_URL).href,
  signUpUrl: new URL("/sign-up", APP_URL).href,
  docsUrl: "[DOCS_URL]",
  demoUrl: "[BOOK_A_DEMO_URL]",
  securityUrl: "[SECURITY_OVERVIEW_URL]",
  contactEmail: "hello@[domain]",
  legalEmail: "legal@[domain]",
  /** Where the newsletter form posts: your email provider's signup endpoint. */
  newsletterAction: "[NEWSLETTER_ENDPOINT]",
  social: [
    { label: "GitHub", href: "[GITHUB_URL]" },
    { label: "LinkedIn", href: "[LINKEDIN_URL]" },
  ],
} as const

export type NavId = "product" | "pricing" | "customers" | "blog" | "changelog" | "docs"

export const nav: { id: NavId; label: string; href: string }[] = [
  { id: "product", label: "Product", href: "/#how-it-works" },
  { id: "pricing", label: "Pricing", href: "/pricing" },
  { id: "customers", label: "Customers", href: "/#customers" },
  { id: "blog", label: "Blog", href: "/blog" },
  { id: "changelog", label: "Changelog", href: "/changelog" },
  { id: "docs", label: "Docs", href: site.docsUrl },
]

export const footerColumns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "PRODUCT",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
      { label: "Security", href: "/#security" },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { label: "Customers", href: "/#customers" },
      { label: "Contact", href: `mailto:${site.contactEmail}` },
    ],
  },
  {
    title: "RESOURCES",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Docs", href: site.docsUrl },
      { label: "RSS", href: "/rss.xml" },
    ],
  },
  {
    title: "LEGAL",
    links: [
      { label: "Terms", href: "/legal/terms" },
      { label: "Privacy", href: "/legal/privacy" },
      { label: "DPA", href: "/legal/dpa" },
      { label: "Cookies", href: "/legal/cookies" },
      { label: "Subprocessors", href: "/legal/subprocessors" },
    ],
  },
]
