/** Blog categories, in the order the category bar shows them. */
export const CATEGORIES = [
  "product",
  "engineering",
  "guides",
  "security",
  "sustainability",
  "customers",
  "opinion",
] as const

export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  product: "Product",
  engineering: "Engineering",
  guides: "Guides",
  security: "Security",
  sustainability: "Sustainability",
  customers: "Customers",
  opinion: "Opinion",
}

/** The categories that have at least one post, in the category bar's order. */
export function usedCategories(posts: { category: Category }[]): Category[] {
  const used = new Set(posts.map((p) => p.category))
  return CATEGORIES.filter((c) => used.has(c))
}

/** The drawn covers a post card can have, cycled down the list. */
export const COVERS = ["ink", "hatch", "outline", "solar"] as const

export type Cover = (typeof COVERS)[number]

export function coverFor(index: number, chosen?: Cover): Cover {
  return chosen ?? COVERS[index % COVERS.length] ?? "ink"
}

/** Changelog entry kinds, which the filter bar and the tags use. */
export const CHANGE_KINDS = ["new", "improved", "fixed"] as const

export type ChangeKind = (typeof CHANGE_KINDS)[number]

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}
