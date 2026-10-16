import { describe, expect, it, vi } from "vitest"
import { AWS_HEALTH_URL, createStatusHandler, parseStatusProviders } from "./status"

const statuspage = (indicator: string, description = "All Systems Operational") =>
  Response.json({ page: { name: "X" }, status: { indicator, description } })

/** AWS Health answers UTF-16 JSON with a byte-order mark: big-endian (FE FF) in practice. */
function awsFeed(events: unknown[], endian: "be" | "le" = "be") {
  const text = JSON.stringify(events)
  const bytes = new Uint8Array(2 + text.length * 2)
  const [hi, lo] = endian === "be" ? [0, 1] : [1, 0]
  bytes[hi] = 0xfe
  bytes[lo] = 0xff
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes[2 + i * 2 + hi] = code >> 8
    bytes[2 + i * 2 + lo] = code & 0xff
  }
  return new Response(bytes, { headers: { "content-type": "application/json;charset=utf-16" } })
}

const body = async (res: Response) => res.json() as Promise<Record<string, any>>

describe("parseStatusProviders", () => {
  it("reads Statuspage entries and AWS service@region entries", () => {
    expect(
      parseStatusProviders(" Vercel=https://www.vercel-status.com/ , aws:ses@us-east-1"),
    ).toEqual([
      { kind: "statuspage", name: "Vercel", url: "https://www.vercel-status.com" },
      { kind: "aws", name: "AWS SES (us-east-1)", service: "ses", region: "us-east-1" },
    ])
    expect(parseStatusProviders(undefined)).toEqual([])
    expect(parseStatusProviders(" ")).toEqual([])
  })

  it("fails loudly on an entry it can't read", () => {
    for (const bad of [
      "Vercel",
      "Vercel=http://insecure.example",
      "=https://x.example",
      "aws:ses",
    ]) {
      expect(() => parseStatusProviders(bad), bad).toThrow(/Can't read status provider/)
    }
  })
})

describe("createStatusHandler", () => {
  it("maps each vendor's indicator and reports the worst one", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith("https://a.example") ? statuspage("none") : statuspage("major", "API down"),
    )
    const handler = createStatusHandler(
      [
        { kind: "statuspage", name: "A", url: "https://a.example" },
        { kind: "statuspage", name: "B", url: "https://b.example" },
      ],
      { fetch },
    )
    const res = await handler()
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({
      status: "outage",
      providers: [
        { name: "A", status: "operational", url: "https://a.example" },
        { name: "B", status: "outage", description: "API down" },
      ],
    })
    expect(fetch).toHaveBeenCalledWith("https://a.example/api/v2/status.json", expect.anything())
  })

  it("reads AWS Health's UTF-16 feed for the configured service and region only", async () => {
    const fetch = vi.fn(async (url: string) => {
      expect(url).toBe(AWS_HEALTH_URL)
      return awsFeed([
        { service: "ses-us-east-1", summary: "Increased send latency" },
        { service: "ec2-eu-west-1", summary: "Elsewhere" },
        { service: "multipleservices-eu-west-2", impacted_services: "{'ses-eu-west-2': {}}" },
      ])
    })
    const handler = createStatusHandler(
      parseStatusProviders("aws:ses@us-east-1,aws:ses@eu-west-2,aws:ses@ap-south-1"),
      {
        fetch,
      },
    )
    const report = await body(await handler())
    expect(report.providers.map((p: { status: string }) => p.status)).toEqual([
      "degraded",
      "degraded",
      "operational",
    ])
    expect(report.providers[0].description).toBe("Increased send latency")
    // One feed request serves every AWS provider.
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("decodes the AWS feed in either byte order", async () => {
    for (const endian of ["be", "le"] as const) {
      const fetch = async () => awsFeed([{ service: "ses-us-east-1", summary: "Slow" }], endian)
      const report = await body(
        await createStatusHandler(parseStatusProviders("aws:ses@us-east-1"), { fetch })(),
      )
      expect(report.providers[0], endian).toMatchObject({ status: "degraded" })
    }
  })

  it("reports an unreachable or slow vendor as unknown, never failing itself", async () => {
    const handler = createStatusHandler(
      [
        { kind: "statuspage", name: "Down", url: "https://down.example" },
        { kind: "statuspage", name: "Slow", url: "https://slow.example" },
        { kind: "statuspage", name: "Odd", url: "https://odd.example" },
      ],
      {
        timeoutMs: 20,
        fetch: async (url, init) => {
          if (url.startsWith("https://down.example")) return new Response("no", { status: 503 })
          if (url.startsWith("https://odd.example")) return Response.json({ status: {} })
          return new Promise((_, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          )
        },
      },
    )
    const res = await handler()
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({
      status: "unknown",
      providers: [{ status: "unknown" }, { status: "unknown" }, { status: "unknown" }],
    })
  })

  it("asks the vendors at most once per cache period", async () => {
    let clock = 0
    const fetch = vi.fn(async () => statuspage("none"))
    const handler = createStatusHandler(
      [{ kind: "statuspage", name: "A", url: "https://a.example" }],
      {
        fetch,
        cacheMs: 60_000,
        now: () => clock,
      },
    )
    await handler()
    clock = 59_999
    const cached = await handler()
    expect(cached.headers.get("cache-control")).toBe("public, max-age=60")
    expect(fetch).toHaveBeenCalledTimes(1)
    clock = 60_000
    await handler()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("is operational with no providers configured", async () => {
    expect(await body(await createStatusHandler([])())).toMatchObject({
      status: "operational",
      providers: [],
    })
  })
})
