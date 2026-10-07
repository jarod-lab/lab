import type { Meta, StoryObj } from "@storybook/react-vite"
import SkeletonExample from "../skeleton-example"
import { Skeleton } from "./skeleton"

const meta = {
  title: "ui/Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Skeleton>

export default meta

export const Examples: StoryObj = {
  render: () => <SkeletonExample />,
}
