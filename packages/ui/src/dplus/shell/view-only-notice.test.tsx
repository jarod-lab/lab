// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { ViewOnlyNotice } from "./view-only-notice"

describe("ViewOnlyNotice", () => {
  it("says what the viewer can see, with an optional reason", async () => {
    const plain = renderToStaticMarkup(<ViewOnlyNotice subject="Acme Inc" />)
    expect(plain).toContain("You have view-only access to Acme Inc.")
    const reason = renderToStaticMarkup(
      <ViewOnlyNotice subject="Acme Inc">Ask an owner.</ViewOnlyNotice>,
    )
    expect(reason).toContain("Ask an owner.")
    await expectNoA11yViolations(reason)
  })
})
