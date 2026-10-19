import rss from "@astrojs/rss"
import type { APIRoute } from "astro"

import { allPosts } from "../lib/content"
import { site } from "../site"

/** The blog feed, newest first. */
export const GET: APIRoute = async (context) =>
  rss({
    title: `${site.name} blog`,
    description: site.tagline,
    site: context.site ?? context.url.origin,
    items: (await allPosts()).map(({ summary }) => ({
      title: summary.title,
      description: summary.description,
      pubDate: summary.date,
      link: `/blog/${summary.slug}`,
      author: summary.author,
    })),
  })
