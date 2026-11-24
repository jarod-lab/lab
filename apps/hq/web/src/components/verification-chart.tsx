// An inline svg has no `img` element for the lint rule to prefer: the role names the whole chart
// as one picture (its bars are decoration), with the totals in aria-label.
const CHART_ROLE = "img"
const HEIGHT = 56
const BAR_MAX = 52
const SLOT = 4
const BAR = 3
const HOUR_MS = 3_600_000

interface Bucket {
  at: string
  count: number
}

/** Hours between two instants, in whole hours when it is one, else with one decimal. */
function hoursBetween(from: number, to: number): string {
  const hours = (to - from) / HOUR_MS
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

/**
 * The signals of the item's recurrence key in 30-minute buckets, as one inline SVG made of tokens
 * only: bars are `<rect>`s with a token colour class and `fill="currentColor"` (no style attribute),
 * red before the merge and green from the bucket that starts at the merge on. hq's range starts 12
 * hours before the merge and ends at now (or at the window's end, `through="window end"`), so the
 * first caption is derived from the data and the last says which end it is. No buckets (an item
 * without a recurrence key) draw no chart.
 */
export function VerificationChart({
  buckets,
  mergedAt,
  through = "now",
}: {
  buckets: Bucket[]
  mergedAt: string | null
  /** What the right edge is: "now" while the window runs, else "window end". */
  through?: "now" | "window end"
}) {
  if (buckets.length === 0) {
    return (
      <p className="m-0 text-xs text-faint">
        No occurrence counts: this item has no recurrence key.
      </p>
    )
  }
  const merge = mergedAt === null ? Number.NaN : new Date(mergedAt).getTime()
  const merged = !Number.isNaN(merge)
  const isBefore = (bucket: Bucket) => !merged || new Date(bucket.at).getTime() < merge
  const before = buckets.filter(isBefore).reduce((sum, b) => sum + b.count, 0)
  const total = buckets.reduce((sum, b) => sum + b.count, 0)
  const max = Math.max(...buckets.map((b) => b.count))
  const label = merged
    ? `Signals per 30 minutes: ${before} before the merge, ${total - before} since`
    : `Signals per 30 minutes: ${total} so far, no merge yet`
  const firstSince = buckets.findIndex((b) => !isBefore(b))
  const first = new Date(buckets[0]?.at ?? "").getTime()
  const lead =
    merged && !Number.isNaN(first) && first < merge
      ? `${hoursBetween(first, merge)} h before the merge`
      : null

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <svg
        role={CHART_ROLE}
        aria-label={label}
        viewBox={`0 0 ${buckets.length * SLOT} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-14 w-full"
      >
        {buckets.map((bucket, i) => {
          // A zero is a hairline; max is above 0 whenever a count is, so no division by 0.
          const height =
            bucket.count === 0 ? 1 : Math.max(2, Math.round((bucket.count / max) * BAR_MAX))
          return (
            <rect
              key={bucket.at}
              className={isBefore(bucket) ? "text-destructive" : "text-success"}
              fill="currentColor"
              x={i * SLOT + (SLOT - BAR) / 2}
              y={HEIGHT - height}
              width={BAR}
              height={height}
            />
          )
        })}
        {firstSince > 0 ? (
          <line
            className="text-faint"
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            x1={firstSince * SLOT}
            x2={firstSince * SLOT}
            y1={0}
            y2={HEIGHT}
          />
        ) : null}
      </svg>
      <div className="flex justify-between gap-2 font-mono text-[10.5px] text-faint">
        <span>{lead ?? (merged ? "merged" : "start of range")}</span>
        {merged && lead ? <span>merged</span> : null}
        <span>{through}</span>
      </div>
      <p className="m-0 font-mono text-[10.5px] text-faint">
        {max === 0
          ? "No signals in this range"
          : `Tallest bar: ${max} ${max === 1 ? "signal" : "signals"} in 30 minutes`}
      </p>
    </div>
  )
}
