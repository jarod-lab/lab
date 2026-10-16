import type { Meta, StoryObj } from "@storybook/react-vite"
import { ArrowRightIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { VariantRow, VariantTable } from "../../dplus/pages/story-kit"
import { withDark } from "../../dplus/pages/story-kit"
import { Button } from "./button"
import { Spinner } from "./spinner"

const meta = {
  title: "ui/Button",
  component: Button,
  args: { children: "Button" },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "destructive", "hatch", "link"],
    },
    size: {
      control: "select",
      options: ["xs", "sm", "default", "lg", "icon-xs", "icon-sm", "icon", "icon-lg"],
    },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Outline: Story = { args: { variant: "outline" } }
export const Large: Story = { args: { size: "lg" } }

const variants = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "hatch",
  "link",
] as const
const sizes = ["lg", "default", "sm", "xs"] as const

/** Every variant at every size, plus disabled, with icons, loading and icon-only. */
function AllVariants() {
  return (
    <VariantTable columns={[...sizes, "disabled", "icon + text", "loading", "icon only"]}>
      {variants.map((variant) => (
        <VariantRow key={variant} name={variant}>
          {sizes.map((size) => (
            <Button key={size} variant={variant} size={size}>
              Save changes
            </Button>
          ))}
          <Button variant={variant} disabled>
            Read only
          </Button>
          <Button variant={variant}>
            <PlusIcon data-icon="inline-start" />
            Invite
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
          <Button variant={variant} disabled>
            <Spinner data-icon="inline-start" />
            Saving
          </Button>
          <span className="flex items-center gap-2">
            <Button variant={variant} size="icon-lg" aria-label="Delete">
              <Trash2Icon />
            </Button>
            <Button variant={variant} size="icon" aria-label="Delete">
              <Trash2Icon />
            </Button>
            <Button variant={variant} size="icon-sm" aria-label="Delete">
              <Trash2Icon />
            </Button>
            <Button variant={variant} size="icon-xs" aria-label="Delete">
              <Trash2Icon />
            </Button>
          </span>
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
