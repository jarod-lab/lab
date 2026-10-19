import { cn } from "cn"
import type * as React from "react"
import { useMemo } from "react"
import { encode } from "uqr"

/** The code as an SVG document: ink modules on paper, with the quiet zone included. */
export function qrCodeSvg(value: string): string {
  const qr = encode(value, { ecc: "M", border: 4 })
  let d = ""
  qr.data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`
    })
  })
  // The SVG namespace is an identifier, not a link: it is always http://.
  // baseline:allow-next-line no-http-links
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fafaf7"/><path d="${d}" fill="#111111"/></svg>`
}

/**
 * A QR code, encoded in the browser so the value (an `otpauth://` secret, say) never leaves the
 * page. The colours are the light theme's paper and ink in both themes, like the overlay scrim:
 * several authenticator apps can't read an inverted code. The four-module quiet zone is part of
 * the image.
 */
function QrCode({
  value,
  label,
  className,
  ...props
}: {
  /** The text to encode. */
  value: string
  /** What the code is, for assistive tech (the image's `alt`). */
  label: string
} & Omit<React.ComponentProps<"img">, "src" | "alt" | "children">) {
  const src = useMemo(() => `data:image/svg+xml,${encodeURIComponent(qrCodeSvg(value))}`, [value])
  return (
    <img
      data-slot="qr-code"
      src={src}
      alt={label}
      className={cn("size-48 shrink-0 rounded-lg [image-rendering:pixelated]", className)}
      {...props}
    />
  )
}

export { QrCode }
