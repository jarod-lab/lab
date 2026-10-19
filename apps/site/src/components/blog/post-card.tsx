import { cn } from "cn"

import { CATEGORY_LABELS, type Category, type Cover, formatDate } from "../../data/content"

/** What a list of posts needs from each one. */
export interface PostSummary {
  slug: string
  title: string
  description: string
  category: Category
  author: string
  date: Date
  readingMinutes: number
  cover: Cover
  coverText?: string
}

/** The drawn covers: ink, hatched, outlined or solar. No images to load. */
const COVER_CLASSES: Record<Cover, string> = {
  ink: "bg-primary text-primary-foreground",
  hatch: "hatch border text-foreground",
  outline: "border-2 border-foreground text-foreground",
  solar: "bg-solar text-solar-foreground",
}

export function PostCover({
  cover,
  label,
  className,
}: {
  cover: Cover
  label: string
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-end rounded-xl p-4.5 type-eyebrow",
        COVER_CLASSES[cover],
        className,
      )}
    >
      {label}
    </div>
  )
}

export function postMeta(post: Pick<PostSummary, "author" | "date" | "readingMinutes">): string {
  return `${post.author} · ${formatDate(post.date)} · ${post.readingMinutes} min read`
}

/** A post in the grid: cover, title (the link), dek and byline. */
export function PostCard({ post }: { post: PostSummary }) {
  return (
    <article className="flex flex-col gap-3">
      <PostCover
        cover={post.cover}
        label={CATEGORY_LABELS[post.category].toUpperCase()}
        className="h-40"
      />
      <h3 className="text-[21px] leading-tight font-extrabold tracking-[-0.015em]">
        <a href={`/blog/${post.slug}`} className="hover:underline">
          {post.title}
        </a>
      </h3>
      <p className="text-[15.5px] text-secondary-foreground">{post.description}</p>
      <p className="text-sm text-muted-foreground">{postMeta(post)}</p>
    </article>
  )
}

/** The featured post, large, with a typeset cover. */
export function FeaturedPost({ post }: { post: PostSummary }) {
  const label = CATEGORY_LABELS[post.category].toUpperCase()
  return (
    <article className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-center gap-8 rounded-[18px] border-2 border-foreground p-7">
      <div
        aria-hidden="true"
        className="flex min-h-70 flex-col justify-between rounded-xl bg-solar p-6 text-solar-foreground"
      >
        <span className="type-eyebrow">{label}</span>
        <span className="text-[44px] leading-[0.95] font-extrabold tracking-[-0.04em]">
          {post.coverText ?? post.title}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <span className="type-eyebrow text-muted-foreground">FEATURED · {label}</span>
        <h2 className="text-[clamp(28px,3vw,38px)] leading-[1.1] font-extrabold tracking-[-0.03em]">
          <a href={`/blog/${post.slug}`} className="hover:underline">
            {post.title}
          </a>
        </h2>
        <p className="text-[17px] text-secondary-foreground">{post.description}</p>
        <p className="text-[14.5px] text-muted-foreground">{postMeta(post)}</p>
      </div>
    </article>
  )
}
