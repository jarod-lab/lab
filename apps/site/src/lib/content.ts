import { type CollectionEntry, getCollection } from "astro:content"

// Content queries for the pages. They run at build time against src/content, so the build is their
// test (vitest.config.ts leaves this folder out of coverage).

import type { PostSummary } from "../components/blog/post-card"
import { coverFor } from "../data/content"

/** Every post, newest first, with its card cover chosen. */
export async function allPosts(): Promise<
  { entry: CollectionEntry<"blog">; summary: PostSummary }[]
> {
  const entries = (await getCollection("blog")).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  )
  return entries.map((entry, i) => ({ entry, summary: toSummary(entry, i) }))
}

function toSummary(entry: CollectionEntry<"blog">, index: number): PostSummary {
  const { data } = entry
  return {
    slug: entry.id,
    title: data.title,
    description: data.description,
    category: data.category,
    author: data.author,
    date: data.date,
    readingMinutes: data.readingMinutes,
    cover: coverFor(index, data.cover),
    coverText: data.coverText,
  }
}

/** Changelog entries, newest first. */
export async function allChanges(): Promise<CollectionEntry<"changelog">[]> {
  return (await getCollection("changelog")).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  )
}

/** Legal documents in tab order. */
export async function allLegal(): Promise<CollectionEntry<"legal">[]> {
  return (await getCollection("legal")).sort((a, b) => a.data.order - b.data.order)
}
