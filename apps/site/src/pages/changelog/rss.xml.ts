import rss from "@astrojs/rss"
import type { APIRoute } from "astro"

import { allChanges } from "../../lib/content"
import { site } from "../../site"

/** The changelog feed, one item per release. */
export const GET: APIRoute = async (context) =>
  rss({
    title: `${site.name} changelog`,
    description: `Everything ${site.name} ships, newest first.`,
    site: context.site ?? context.url.origin,
    items: (await allChanges()).map((entry) => ({
      title: `${entry.data.version}: ${entry.data.title}`,
      pubDate: entry.data.date,
      link: entry.data.post ? `/blog/${entry.data.post}` : `/changelog#${entry.id}`,
      content: entry.rendered?.html,
    })),
  })
