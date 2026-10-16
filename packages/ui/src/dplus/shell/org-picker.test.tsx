// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { demoOrgs } from "../pages/story-kit"
import { OrgPicker, type OrgPickerProps } from "./org-picker"
import { byText, click, mount } from "./test-helpers"

const base: OrgPickerProps = {
  orgs: demoOrgs,
  activeOrgId: "acme",
  hrefFor: (o) => `/${o.slug}`,
  settingsHref: "/acme/settings",
  createHref: "/new",
}

describe("OrgPicker", () => {
  it("names the active org on the trigger, with its role", () => {
    const html = renderToStaticMarkup(<OrgPicker {...base} />)
    expect(html).toContain('aria-label="Switch organization, current Acme Inc"')
    expect(html).toContain("Owner")
    return expectNoA11yViolations(html)
  })

  it("covers loading, error, no active org and a single org", async () => {
    expect(renderToStaticMarkup(<OrgPicker {...base} status="loading" orgs={[]} />)).toContain(
      "Loading organizations",
    )
    expect(renderToStaticMarkup(<OrgPicker {...base} activeOrgId={null} />)).toContain(
      "Choose an organization",
    )
    const single = renderToStaticMarkup(<OrgPicker {...base} orgs={[demoOrgs[0]!]} />)
    expect(single).toContain("Acme Inc")
    await expectNoA11yViolations(renderToStaticMarkup(<OrgPicker {...base} status="error" />))
  })

  it("personal orgs say so and the trigger shows 'Personal' for them", () => {
    const html = renderToStaticMarkup(<OrgPicker {...base} activeOrgId="jordan" />)
    expect(html).toContain("Personal · Owner")
  })

  it("lists orgs, marks the current one, and offers the org actions when open", async () => {
    const h = mount(<OrgPicker {...base} open />)
    expect(document.querySelector('[aria-current="true"]')?.textContent).toContain("Acme Inc")
    expect(byText("Northwind Labs")).toBeTruthy()
    expect(byText("Organization settings").closest("a")?.getAttribute("href")).toBe(
      "/acme/settings",
    )
    expect(byText("Create organization").closest("a")?.getAttribute("href")).toBe("/new")
    const snapshot = document.body.innerHTML
    h.cleanup()
    await expectNoA11yViolations(snapshot)
  })

  it("offers retry in the error state and calls onRetry", () => {
    const onRetry = vi.fn()
    const h = mount(<OrgPicker {...base} orgs={[]} status="error" onRetry={onRetry} open />)
    click(byText("Try again"))
    expect(onRetry).toHaveBeenCalledOnce()
    h.cleanup()
  })

  it("says so when there are no orgs and renders the ready state with none", () => {
    const h = mount(<OrgPicker {...base} orgs={[]} activeOrgId={null} open />)
    expect(document.body.textContent).toContain("You are not in any organization.")
    h.cleanup()
  })
})
