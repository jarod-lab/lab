import type { Meta, StoryObj } from "@storybook/react-vite"
import { VariantRow, VariantTable } from "../../dplus/pages/story-kit"
import { withDark } from "../../dplus/pages/app-shell"
import CardExample from "../examples/card-example"
import { Button } from "./button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card"

const meta = {
  title: "ui/Card",
  component: Card,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Card>

export default meta

export const Examples: StoryObj = {
  render: () => <CardExample />,
}

const variants = [
  ["default", "Free", "3 seats · 2 agents · community support"],
  ["selected", "Pro", "Current plan · up to 25 seats"],
  ["destructive", "Danger zone", "Permanently deletes 4 agents, 3 API keys and all run history."],
] as const

/** Each variant at both sizes, with header, action, content and footer. */
function AllVariants() {
  return (
    <VariantTable columns={["default", "sm"]}>
      {variants.map(([variant, title, body]) => (
        <VariantRow key={variant} name={variant}>
          {(["default", "sm"] as const).map((size) => (
            <Card key={size} variant={variant} size={size} className="w-90">
              <CardHeader>
                <CardTitle>
                  {variant === "selected" ? (
                    <span className="highlight px-0.5">{title}</span>
                  ) : (
                    title
                  )}
                </CardTitle>
                <CardDescription>{body}</CardDescription>
                <CardAction>
                  <Button size="sm" variant={variant === "destructive" ? "destructive" : "outline"}>
                    {variant === "destructive" ? "Delete" : "Edit"}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="text-secondary-foreground">
                Billed per seat each month.
              </CardContent>
              <CardFooter className="text-sm text-muted-foreground">
                Renews [RENEWAL DATE]
              </CardFooter>
            </Card>
          ))}
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
