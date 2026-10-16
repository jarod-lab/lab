import type { Meta, StoryObj } from "@storybook/react-vite"
import InputOTPExample from "../examples/input-otp-example"
import { InputOTP } from "./input-otp"

const meta = {
  title: "ui/Input Otp",
  component: InputOTP,
  parameters: { layout: "padded" },
} satisfies Meta<typeof InputOTP>

export default meta

export const Examples: StoryObj = {
  render: () => <InputOTPExample />,
}
