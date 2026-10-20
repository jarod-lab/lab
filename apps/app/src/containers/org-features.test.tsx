// @vitest-environment jsdom
import { InMemoryProvider, OpenFeature } from "@openfeature/web-sdk"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { createFlagProvider, FLAG_DOMAIN, flagContext, useFlag } from "../lib/flags"
import { json, productFetch } from "../test/product-fetch"
import { OrgFeatures } from "./org-features"

function Probe() {
  const whatsNew = useFlag("whats-new-card")
  return <p>whats-new {String(whatsNew)}</p>
}

const inMemory = (value: boolean) => () =>
  new InMemoryProvider({
    "whats-new-card": {
      variants: { on: true, off: false },
      defaultVariant: value ? "on" : "off",
      disabled: false,
    },
  })

function renderFeatures(props: Partial<Parameters<typeof OrgFeatures>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrgFeatures organizationId="org-1" createProvider={inMemory(false)} {...props}>
        <Probe />
      </OrgFeatures>
    </QueryClientProvider>,
  )
}

afterEach(async () => {
  await OpenFeature.clearProviders()
})

describe("OrgFeatures", () => {
  it("serves the flag's value from the organization's provider", async () => {
    renderFeatures({ createProvider: inMemory(true) })
    expect(await screen.findByText("whats-new true")).toBeTruthy()
    expect(OpenFeature.getContext(FLAG_DOMAIN)).toEqual({ targetingKey: "org-1" })
  })

  it("falls back to the catalog default when the flags can't be read", async () => {
    renderFeatures({
      createProvider: () => createFlagProvider("org-1", async () => json({}, { status: 500 })),
    })
    expect(await screen.findByText("whats-new false")).toBeTruthy()
  })
})

describe("createFlagProvider", () => {
  it("asks OFREP for every flag, for the organization, with the session cookie", async () => {
    const { fetchImpl, sent } = productFetch(() =>
      json({ flags: [{ key: "whats-new-card", value: true, reason: "STATIC", variant: "on" }] }),
    )
    await OpenFeature.setProviderAndWait(
      "ofrep-test",
      createFlagProvider("org-7", fetchImpl),
      flagContext("org-7"),
    )
    const client = OpenFeature.getClient("ofrep-test")
    await waitFor(() => expect(client.getBooleanValue("whats-new-card", false)).toBe(true))
    expect(sent[0]).toMatchObject({
      method: "POST",
      path: "/ofrep/v1/evaluate/flags",
      organization: "org-7",
      credentials: "same-origin",
    })
    expect(sent[0]?.body).toMatchObject({ context: { targetingKey: "org-7" } })
  })
})
