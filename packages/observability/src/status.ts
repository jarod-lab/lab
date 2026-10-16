// What our third parties say about themselves. `/health` only says this process is up; it never pings
// a dependency. This asks each vendor's own status page instead, caches the answer, and reports it,
// so an outage upstream is visible without our servers probing anything.
import type { Logger } from "@starter/logger"

/** A vendor status source. */
export type StatusProvider =
  /** An Atlassian Statuspage (most vendors): `${url}/api/v2/status.json`. */
  | { kind: "statuspage"; name: string; url: string }
  /** AWS Health's public feed, filtered to one service in one region (e.g. ses, us-east-1). */
  | { kind: "aws"; name: string; service: string; region: string }

export type ProviderState = "operational" | "degraded" | "outage" | "unknown"

export interface ProviderStatus {
  name: string
  status: ProviderState
  /** The vendor's own words, when it gave any. */
  description?: string
  /** Where a person can read more. */
  url: string
}

export interface StatusReport {
  /** The worst provider state, or "operational" with no providers. */
  status: ProviderState
  checkedAt: string
  providers: ProviderStatus[]
}

export const AWS_HEALTH_URL = "https://health.aws.amazon.com/public/currentevents"

/**
 * Parse a provider list: comma-separated `Name=https://status.example.com` (a Statuspage) or
 * `aws:<service>@<region>` (AWS Health), e.g. `Vercel=https://www.vercel-status.com,aws:ses@us-east-1`.
 * Throws on an entry it can't read, so a typo fails at startup rather than showing nothing.
 */
export function parseStatusProviders(spec: string | undefined): StatusProvider[] {
  if (!spec?.trim()) return []
  return spec.split(",").map((raw): StatusProvider => {
    const entry = raw.trim()
    const aws = /^aws:([a-z0-9-]+)@([a-z0-9-]+)$/.exec(entry)
    if (aws?.[1] && aws[2]) {
      return {
        kind: "aws",
        name: `AWS ${aws[1].toUpperCase()} (${aws[2]})`,
        service: aws[1],
        region: aws[2],
      }
    }
    const at = entry.indexOf("=")
    const name = entry.slice(0, at).trim()
    const url = entry
      .slice(at + 1)
      .trim()
      .replace(/\/+$/, "")
    if (at > 0 && name && /^https:\/\/[^\s/]+/.test(url)) return { kind: "statuspage", name, url }
    throw new Error(
      `Can't read status provider "${entry}": use Name=https://status.example.com or aws:ses@us-east-1`,
    )
  })
}

const SEVERITY: Record<ProviderState, number> = {
  operational: 0,
  unknown: 1,
  degraded: 2,
  outage: 3,
}

function fromIndicator(indicator: unknown): ProviderState {
  switch (indicator) {
    case "none":
      return "operational"
    case "minor":
    case "maintenance":
      return "degraded"
    case "major":
    case "critical":
      return "outage"
    default:
      return "unknown"
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

async function checkStatuspage(
  p: Extract<StatusProvider, { kind: "statuspage" }>,
  fetchFn: Fetch,
  signal: AbortSignal,
): Promise<ProviderStatus> {
  const res = await fetchFn(`${p.url}/api/v2/status.json`, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = (await res.json()) as { status?: { indicator?: unknown; description?: unknown } }
  const description = body.status?.description
  return {
    name: p.name,
    status: fromIndicator(body.status?.indicator),
    ...(typeof description === "string" && { description }),
    url: p.url,
  }
}

interface AwsEvent {
  service?: unknown
  summary?: unknown
  impacted_services?: unknown
}

/** AWS Health's feed is UTF-16 JSON: a list of current events, each naming `<service>-<region>`. */
async function awsEvents(fetchFn: Fetch, signal: AbortSignal): Promise<AwsEvent[]> {
  const res = await fetchFn(AWS_HEALTH_URL, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe
  const text = new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(bytes).replace(/^﻿/, "")
  const events: unknown = JSON.parse(text)
  return Array.isArray(events) ? (events as AwsEvent[]) : []
}

function awsStatus(
  p: Extract<StatusProvider, { kind: "aws" }>,
  events: readonly AwsEvent[],
): ProviderStatus {
  const id = `${p.service}-${p.region}`
  // `impacted_services` arrives as a string, so a quoted id inside it counts as a match.
  const hits = events.filter(
    (e) =>
      e.service === id ||
      (typeof e.impacted_services === "string" && e.impacted_services.includes(`'${id}'`)),
  )
  const summary = hits.map((e) => e.summary).find((s) => typeof s === "string")
  return {
    name: p.name,
    status: hits.length > 0 ? "degraded" : "operational",
    ...(typeof summary === "string" && { description: summary }),
    url: "https://health.aws.amazon.com/health/status",
  }
}

export interface StatusOptions {
  /** How long a report is reused. Default 60s, so traffic to /status never reaches the vendors. */
  cacheMs?: number
  /** Per-vendor budget before it counts as unknown. Default 3000. */
  timeoutMs?: number
  fetch?: Fetch
  logger?: Logger
  now?: () => number
}

/**
 * `GET /status`: each provider's state as its vendor reports it. Always 200 (this page being up is
 * not in question), with a vendor that can't be reached reported as "unknown".
 */
export function createStatusHandler(
  providers: readonly StatusProvider[],
  {
    cacheMs = 60_000,
    timeoutMs = 3000,
    fetch: fetchFn = fetch,
    logger,
    now = Date.now,
  }: StatusOptions = {},
) {
  let cached: { at: number; report: Promise<StatusReport> } | undefined

  async function build(): Promise<StatusReport> {
    const signal = AbortSignal.timeout(timeoutMs)
    let aws: Promise<AwsEvent[]> | undefined
    const results = await Promise.all(
      providers.map(async (p): Promise<ProviderStatus> => {
        try {
          if (p.kind === "statuspage") return await checkStatuspage(p, fetchFn, signal)
          aws ??= awsEvents(fetchFn, signal)
          return awsStatus(p, await aws)
        } catch (e) {
          logger?.warn({ err: e, provider: p.name }, "status provider unreachable")
          const url =
            p.kind === "statuspage" ? p.url : "https://health.aws.amazon.com/health/status"
          return { name: p.name, status: "unknown", url }
        }
      }),
    )
    const worst = results.reduce<ProviderState>(
      (acc, r) => (SEVERITY[r.status] > SEVERITY[acc] ? r.status : acc),
      "operational",
    )
    return { status: worst, checkedAt: new Date(now()).toISOString(), providers: results }
  }

  return async (): Promise<Response> => {
    if (!cached || now() - cached.at >= cacheMs) cached = { at: now(), report: build() }
    return Response.json(await cached.report, {
      headers: { "cache-control": `public, max-age=${Math.floor(cacheMs / 1000)}` },
    })
  }
}
