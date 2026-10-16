import type { Meta, StoryObj } from "@storybook/react-vite"
import { CheckIcon } from "lucide-react"
import { VariantRow, VariantTable } from "../../dplus/pages/story-kit"
import { withDark } from "../../dplus/pages/story-kit"
import BadgeExample from "../examples/badge-example"
import { Badge } from "./badge"

const meta = {
  title: "ui/Badge",
  component: Badge,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Badge>

export default meta

export const Examples: StoryObj = {
  render: () => <BadgeExample />,
}

const variants = [
  ["solar", "3 waiting"],
  ["default", "Owner"],
  ["outline", "Viewer"],
  ["secondary", "Member"],
  ["success", "Paid"],
  ["destructive", "Expired"],
  ["ghost", "Draft"],
  ["link", "Docs"],
] as const

/** Every variant at both sizes, with an icon and as a link. `solar` means "needs you". */
function AllVariants() {
  return (
    <VariantTable columns={["default", "sm", "with icon", "as link"]}>
      {variants.map(([variant, text]) => (
        <VariantRow key={variant} name={variant}>
          <Badge variant={variant}>{text}</Badge>
          <Badge variant={variant} size="sm">
            {text.toUpperCase()}
          </Badge>
          <Badge variant={variant}>
            <CheckIcon data-icon="inline-start" />
            {text}
          </Badge>
          <Badge variant={variant} render={<a href="#badge">{text}</a>} />
        </VariantRow>
      ))}
    </VariantTable>
  )
}

export const Variants: StoryObj = {
  parameters: { layout: "fullscreen" },
  render: () => <AllVariants />,
}
export const VariantsDark: StoryObj = { ...Variants, decorators: [withDark] }
