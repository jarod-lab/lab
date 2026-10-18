// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { expectNoA11yViolations } from "../a11y"
import { QrCode, qrCodeSvg } from "./qr-code"

const URI = "otpauth://totp/Starter:jordan%40acme.dev?secret=JBSWY3DPEHPK3PXP&issuer=Starter"

describe("QrCode", () => {
  it("is an image named by its label, drawn from the value, with no violations", async () => {
    const html = renderToStaticMarkup(
      <QrCode value={URI} label="QR code for the setup link" className="size-40" />,
    )
    expect(html).toContain('alt="QR code for the setup link"')
    expect(html).toContain(`src="data:image/svg+xml,${encodeURIComponent(qrCodeSvg(URI))}"`)
    expect(html).toContain("size-40")
    await expectNoA11yViolations(html)
  })
})

describe("qrCodeSvg", () => {
  it("keeps a four-module quiet zone around the code", () => {
    const svg = qrCodeSvg("ab")
    // Version 1 is 21 modules, plus 4 on each side.
    expect(svg).toContain('viewBox="0 0 29 29"')
    expect(svg).toContain('d="M4 4h1v1h-1z')
    expect(svg).not.toMatch(/M[0-3] /)
  })

  it("draws ink on paper whatever the theme", () => {
    expect(qrCodeSvg("ab")).toMatch(/<rect [^>]*fill="#fafaf7"\/><path [^>]*fill="#111111"/)
  })

  it("draws the same code for the same value, and a different one for another", () => {
    expect(qrCodeSvg(URI)).toBe(qrCodeSvg(URI))
    expect(qrCodeSvg(`${URI}x`)).not.toBe(qrCodeSvg(URI))
  })
})
