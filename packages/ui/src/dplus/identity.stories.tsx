import type { Meta, StoryObj } from "@storybook/react-vite"
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup } from "../components/ui/avatar"
import { OrgMark } from "./org-mark"
import { withDark } from "./pages/story-kit"
import { VariantRow, VariantTable } from "./pages/story-kit"

// Identity: organizations are square OrgMarks, people are round Avatars.

const meta = {
  title: "D+/Identity",
  component: OrgMark,
  args: { name: "Acme Inc", look: "filled", size: "default" },
  argTypes: {
    look: { control: "inline-radio", options: ["filled", "outline", "personal"] },
    size: { control: "inline-radio", options: ["sm", "default", "lg"] },
  },
} satisfies Meta<typeof OrgMark>

export default meta

export const Playground: StoryObj<typeof meta> = {}

const looks = [
  ["filled", "Acme Inc", "current org"],
  ["outline", "Northwind Labs", "another org"],
  ["personal", "Jordan's workspace", "personal workspace"],
] as const

function AllVariants() {
  return (
    <VariantTable columns={["sm", "default", "lg", "in context"]}>
      {looks.map(([look, name, note]) => (
        <VariantRow key={look} name={`OrgMark ${look}`}>
          <OrgMark name={name} look={look} size="sm" />
          <OrgMark name={name} look={look} />
          <OrgMark name={name} look={look} size="lg" />
          <span className="flex items-center gap-2.5">
            <OrgMark name={name} look={look} />
            <span className="flex flex-col leading-tight">
              <span className="font-semibold">{name}</span>
              <span className="text-xs text-muted-foreground">{note}</span>
            </span>
          </span>
        </VariantRow>
      ))}
      <VariantRow name="Avatar">
        <Avatar size="sm">
          <AvatarFallback className="text-[10px]">JL</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback className="text-xs">JL</AvatarFallback>
        </Avatar>
        <Avatar size="lg">
          <AvatarFallback>JL</AvatarFallback>
        </Avatar>
        <span className="flex items-center gap-4">
          <Avatar>
            <AvatarFallback className="text-xs">PS</AvatarFallback>
            <AvatarBadge className="bg-solar" />
          </Avatar>
          <AvatarGroup>
            {["JL", "PS", "AK"].map((i) => (
              <Avatar key={i}>
                <AvatarFallback className="text-xs">{i}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </span>
      </VariantRow>
    </VariantTable>
  )
}

export const Variants: StoryObj = {
  parameters: { layout: "fullscreen" },
  render: () => <AllVariants />,
}
export const VariantsDark: StoryObj = { ...Variants, decorators: [withDark] }
