import { describe, expect, it, vi } from "vitest"
import { AWS_HEALTH_URL, createStatusHandler, parseStatusProviders, statusioUrl } from "./status"

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

type Report = Record<string, unknown> & { providers: { status: string; description?: string }[] }
const body = async (res: Response) => res.json() as Promise<Report>

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

  it("reads all of AWS, one AWS region, and status.io pages", () => {
    expect(
      parseStatusProviders("aws,aws@eu-west-1,Neon=statusio:6878fc85709daa75be6c7e3c"),
    ).toEqual([
      { kind: "aws", name: "AWS" },
      { kind: "aws", name: "AWS (eu-west-1)", region: "eu-west-1" },
      { kind: "statusio", name: "Neon", pageId: "6878fc85709daa75be6c7e3c" },
    ])
  })

  it("fails loudly on an entry it can't read", () => {
    for (const bad of [
      "Vercel",
      "Vercel=http://insecure.example",
      "=https://x.example",
      "aws:ses",
      "Neon=statusio:not-a-page-id",
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
    expect(report.providers[0]?.description).toBe("Increased send latency (ses-us-east-1)")
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

  it("reads AWS as a whole or by region, naming each open event", async () => {
    const fetch = vi.fn(async () =>
      awsFeed([
        { service: "multipleservices-me-central-1", summary: "Region Availability" },
        { service: "multipleservices-eu-west-2", impacted_services: "{'ses-eu-west-2': {}}" },
      ]),
    )
    const report = await body(
      await createStatusHandler(parseStatusProviders("aws,aws@me-central-1,aws@us-east-1"), {
        fetch,
      })(),
    )
    expect(report.providers).toMatchObject([
      {
        name: "AWS",
        status: "degraded",
        description:
          "Region Availability (multipleservices-me-central-1); multipleservices-eu-west-2",
      },
      { name: "AWS (me-central-1)", status: "degraded" },
      { name: "AWS (us-east-1)", status: "operational" },
    ])
    // A regional event is "degraded", never an outage of AWS as a whole.
    expect(report.status).toBe("degraded")
  })

  it("maps a status.io page's overall code", async () => {
    const page = (status_code: number, status: string) =>
      Response.json({ result: { status_overall: { status_code, status } } })
    const codes: Record<string, [number, string]> = {
      aaaaaaaaaaaaaaaaaaaaaaaa: [100, "Operational"],
      bbbbbbbbbbbbbbbbbbbbbbbb: [400, "Partial Service Disruption"],
      cccccccccccccccccccccccc: [500, "Service Disruption"],
      dddddddddddddddddddddddd: [999, "Something new"],
    }
    const fetch = vi.fn(async (url: string) => {
      const id = Object.keys(codes).find((k) => url === statusioUrl(k))
      if (!id) throw new Error(`unexpected ${url}`)
      return page(...(codes[id] as [number, string]))
    })
    const providers = Object.keys(codes).map((id) => ({
      kind: "statusio" as const,
      name: id.slice(0, 1),
      pageId: id,
    }))
    const report = await body(await createStatusHandler(providers, { fetch })())
    expect(report.providers).toMatchObject([
      { status: "operational", description: "Operational" },
      { status: "degraded", description: "Partial Service Disruption" },
      { status: "outage", url: "https://status.io/pages/cccccccccccccccccccccccc" },
      { status: "unknown" },
    ])
  })

  it("reports an unreachable or slow vendor as unknown, never failing itself", async () => {
    const handler = createStatusHandler(
      [
        { kind: "statuspage", name: "Down", url: "https://down.example" },
        { kind: "statuspage", name: "Slow", url: "https://slow.example" },
        { kind: "statuspage", name: "Odd", url: "https://odd.example" },
        { kind: "statusio", name: "Gone", pageId: "eeeeeeeeeeeeeeeeeeeeeeee" },
      ],
      {
        timeoutMs: 20,
        fetch: async (url, init) => {
          if (url.startsWith("https://down.example")) return new Response("no", { status: 503 })
          if (url.includes("status.io")) return new Response("no", { status: 404 })
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
      providers: [
        { status: "unknown" },
        { status: "unknown" },
        { status: "unknown" },
        { status: "unknown", url: "https://status.io/pages/eeeeeeeeeeeeeeeeeeeeeeee" },
      ],
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
