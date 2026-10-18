import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "./pages/story-kit"
import { VariantRow, VariantTable } from "./pages/story-kit"
import { QrCode } from "./qr-code"

// A two-factor setup link, as the enrol dialog shows it. The secret is the RFC 6238 example.
const setupLink = "otpauth://totp/Starter:jordan%40acme.dev?secret=JBSWY3DPEHPK3PXP&issuer=Starter"

const meta = {
  title: "D+/QR code",
  component: QrCode,
  args: { value: setupLink, label: "QR code for the setup link" },
} satisfies Meta<typeof QrCode>

export default meta

export const Playground: StoryObj<typeof meta> = {}

function AllVariants() {
  return (
    <VariantTable columns={["default", "small"]}>
      <VariantRow name="setup link">
        <QrCode value={setupLink} label="QR code for the setup link" />
        <QrCode value={setupLink} label="QR code for the setup link" className="size-32" />
      </VariantRow>
    </VariantTable>
  )
}

export const Variants: StoryObj = {
  parameters: { layout: "fullscreen" },
  render: () => <AllVariants />,
}
export const VariantsDark: StoryObj = { ...Variants, decorators: [withDark] }
