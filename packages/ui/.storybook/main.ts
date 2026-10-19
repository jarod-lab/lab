import type { StorybookConfig } from "@storybook/react-vite"

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-mcp"],
  framework: "@storybook/react-vite",
  // Publishes a component manifest the MCP server uses for its docs tools.
  features: { componentsManifest: true },
  viteFinal: async (config) => {
    const { default: tailwindcss } = await import("@tailwindcss/vite")
    config.plugins = [...(config.plugins ?? []), tailwindcss()]
    config.build = {
      ...config.build,
      // The largest chunks are Storybook's own: its iframe runtime (~1.1 MB) and the a11y addon's axe.
      chunkSizeWarningLimit: 1500,
      rolldownOptions: {
        ...config.build?.rolldownOptions,
        checks: {
          ...config.build?.rolldownOptions?.checks,
          // Base UI and the shadcn demos start with "use client", which means nothing in a static site.
          moduleLevelDirective: false,
          // A timing report, not a problem with the output.
          bundlerTimings: false,
        },
      },
    }
    return config
  },
}

export default config
