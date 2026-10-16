// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { DangerAction, DangerZone } from "./danger-zone"
import { byText, click, mount } from "./test-helpers"

describe("DangerZone and DangerAction", () => {
  it("names the zone and states the consequence beside a red action", async () => {
    const html = renderToStaticMarkup(
      <DangerZone>
        <DangerAction
          label="Delete organization"
          consequence="Deletes Acme Inc."
          onAction={() => {}}
        />
      </DangerZone>,
    )
    expect(html).toContain("Danger zone")
    expect(html).toContain("Deletes Acme Inc.")
    expect(html).toContain("text-destructive")
    await expectNoA11yViolations(html)
  })

  it("shows the reason and disables the button for a viewer", () => {
    const html = renderToStaticMarkup(
      <DangerAction
        label="Leave"
        consequence="You lose access."
        onAction={() => {}}
        disabled
        disabledReason="Owners cannot leave."
      />,
    )
    expect(html).toContain("Owners cannot leave.")
    expect(html).toContain("disabled")
  })

  it("calls onAction when enabled", () => {
    const onAction = vi.fn()
    const h = mount(<DangerAction label="Delete" consequence="Gone." onAction={onAction} />)
    click(byText("Delete"))
    expect(onAction).toHaveBeenCalledOnce()
    h.cleanup()
  })
})
