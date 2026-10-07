import type * as React from "react"

// shadcn's demos import next/image and next/link. This template has no framework, so the generator
// (scripts/generate-stories.mjs) points those imports here. Plain elements are enough for demos.

type ImageProps = React.ComponentProps<"img"> & {
  /** next/image props with no plain-img equivalent; accepted and ignored. */
  fill?: boolean
  priority?: boolean
  quality?: number
}

export function Image({
  fill: _fill,
  priority: _priority,
  quality: _quality,
  ...props
}: ImageProps) {
  return <img {...props} />
}

export function Link(props: React.ComponentProps<"a">) {
  return <a {...props} />
}
