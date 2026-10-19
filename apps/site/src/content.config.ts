import { defineCollection } from "astro:content"
import { glob } from "astro/loaders"
import { z } from "astro/zod"

import { CATEGORIES, CHANGE_KINDS, COVERS } from "./data/content"

/** Blog posts: one Markdown file per post in src/content/blog, named by its slug. */
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    /** A word or phrase from the end of the title to underline with the highlighter. */
    highlight: z.string().optional(),
    /** The short line set large on a featured post's cover. Unset, the title. */
    coverText: z.string().optional(),
    description: z.string(),
    category: z.enum(CATEGORIES),
    author: z.string(),
    /** One line under the author's name at the end of the post. */
    authorBio: z.string().optional(),
    date: z.coerce.date(),
    readingMinutes: z.number().int().positive(),
    featured: z.boolean().default(false),
    /** How the card's cover is drawn. Unset, it follows the post's position in the list. */
    cover: z.enum(COVERS).optional(),
  }),
})

/** Changelog entries: one Markdown file per release; the body is the summary and its list. */
const changelog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/changelog" }),
  schema: z.object({
    title: z.string(),
    version: z.string(),
    date: z.coerce.date(),
    kinds: z.array(z.enum(CHANGE_KINDS)).min(1),
    /** The blog post that tells the longer story, by slug. */
    post: z.string().optional(),
  }),
})

/** Legal documents, one per tab. Each section's "In short" line comes from its frontmatter. */
const legal = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/legal" }),
  schema: z.object({
    title: z.string(),
    /** The tab label, when shorter than the title. */
    tab: z.string().optional(),
    order: z.number().int(),
    effective: z.string(),
    updated: z.string(),
    summary: z.array(z.string()).default([]),
  }),
})

export const collections = { blog, changelog, legal }
