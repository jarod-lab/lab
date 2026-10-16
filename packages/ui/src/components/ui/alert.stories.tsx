import type { Meta, StoryObj } from "@storybook/react-vite"
import { CircleAlertIcon, EyeIcon, InfoIcon, XIcon } from "lucide-react"
import { Stack } from "../../dplus/pages/story-kit"
import { withDark } from "../../dplus/pages/story-kit"
import AlertExample from "../examples/alert-example"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert"
import { Badge } from "./badge"
import { Button } from "./button"

const meta = {
  title: "ui/Alert",
  component: Alert,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Alert>

export default meta

export const Examples: StoryObj = {
  render: () => <AlertExample />,
}

/** The D+ callouts: every variant, with an icon, and with actions. */
function AllVariants() {
  return (
    <Stack>
      <Alert variant="attention">
        <AlertTitle className="type-eyebrow">● NEEDS YOUR APPROVAL</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span className="type-h2">Post this summary to #releases?</span>
          <span className="flex w-full gap-2">
            <Button className="flex-1">Approve</Button>
            <Button variant="outline" className="flex-1">
              Reject
            </Button>
            <Button variant="outline" className="flex-1">
              Edit
            </Button>
          </span>
          <span className="text-[13px]">Undo available for 30 seconds after you choose.</span>
        </AlertDescription>
      </Alert>
      <Alert variant="attention">
        <AlertTitle>Copy “CI deploy” now. You won't see this key again.</AlertTitle>
        <AlertDescription className="flex items-center gap-2">
          <code className="type-mono flex-1">ak_live_9fQ2xLm7Tz4Kp1Rw8Vb3Hn6Yc5Ds0Ea</code>
          <Button>Copy</Button>
          <Button variant="outline">I've saved it</Button>
        </AlertDescription>
      </Alert>
      <Alert variant="outline">
        <AlertTitle className="flex items-center gap-2">
          <Badge variant="solar" size="sm">
            Pending
          </Badge>
          Confirm jordan@northwind.io
        </AlertTitle>
        <AlertDescription>Your email stays jordan@acme.dev until you click it.</AlertDescription>
        <AlertAction className="flex gap-2">
          <Button size="sm" variant="outline">
            Resend
          </Button>
        </AlertAction>
      </Alert>
      <Alert variant="notice">
        <EyeIcon />
        <AlertTitle>You have view-only access to Acme Inc.</AlertTitle>
        <AlertDescription>Ask an owner or admin to change these settings.</AlertDescription>
      </Alert>
      <Alert variant="inverse">
        <AlertTitle>
          <Badge variant="solar" size="sm">
            NEW
          </Badge>
        </AlertTitle>
        <AlertDescription className="text-base font-bold">
          Agents can open pull requests
        </AlertDescription>
        <AlertAction>
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss announcement">
            <XIcon />
          </Button>
        </AlertAction>
      </Alert>
      <Alert>
        <InfoIcon />
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>Neutral information, no action needed.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Payment failed</AlertTitle>
        <AlertDescription>Update the card to keep your 12 seats.</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="destructive">
            Update card
          </Button>
        </AlertAction>
      </Alert>
    </Stack>
  )
}

export const Variants: StoryObj = {
  parameters: { layout: "fullscreen" },
  render: () => <AllVariants />,
}
export const VariantsDark: StoryObj = { ...Variants, decorators: [withDark] }
