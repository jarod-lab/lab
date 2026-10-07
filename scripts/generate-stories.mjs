#!/usr/bin/env node
// Generates a Storybook story for every shadcn example in packages/ui that has none.
//   cd packages/ui && npx shadcn@latest add <name>-example --overwrite   # then
//   pnpm stories
// Existing *.stories.tsx files are never overwritten.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dirname, "..", "packages", "ui", "src", "components")
const uiDir = join(root, "ui")

const pascal = (kebab) =>
  kebab
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("")

const title = (kebab) =>
  kebab
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")

/** Names exported by a module, from `export function X`, `export const X` and `export { A, B }`. */
function exportsOf(source) {
  const names = new Set()
  for (const m of source.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)) {
    names.add(m[1])
  }
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
      if (name) names.add(name)
    }
  }
  return [...names]
}

// Examples that can't work in a framework-free template (they need the Vercel AI SDK and files from
// shadcn's own website). Their components still exist; they just get no example story.
const SKIP = new Set(["message", "message-scroller"])

// shadcn's demos assume Next.js; point those imports at plain elements.
const IMPORT_SWAPS = [
  [
    'import Image from "next/image"',
    'import { Image } from "@starter/ui/components/example-compat"',
  ],
  ['import Link from "next/link"', 'import { Link } from "@starter/ui/components/example-compat"'],
]

// Exact-string fixes for strict-mode errors in upstream demos (noUncheckedIndexedAccess).
// Each is skipped silently when the upstream text is no longer there.
const PATCHES = [
  ["chart-example.tsx", "radialChartData[0].visitors", "radialChartData[0]?.visitors"],
  ["field-example.tsx", "temperature[0].toFixed(1)", "temperature[0]?.toFixed(1)"],
  ["field-example.tsx", "temperature[1].toFixed(1)", "temperature[1]?.toFixed(1)"],
  ["toggle-group-example.tsx", "setFontWeight(value[0])", "setFontWeight(value[0] ?? fontWeight)"],
]

function sanitize(file) {
  const path = join(root, file)
  let text = readFileSync(path, "utf8")
  const before = text
  for (const [from, to] of IMPORT_SWAPS) text = text.replaceAll(from, to)
  for (const [f, from, to] of PATCHES) if (f === file) text = text.replaceAll(from, to)
  if (text !== before) writeFileSync(path, text)
}

let written = 0
const skipped = []

for (const file of readdirSync(root).filter((f) => f.endsWith("-example.tsx"))) {
  const name = file.replace(/-example\.tsx$/, "")
  if (SKIP.has(name)) {
    skipped.push(`${name} (needs the AI SDK; delete ${file} if present)`)
    continue
  }
  sanitize(file)
  const storyPath = join(uiDir, `${name}.stories.tsx`)
  const uiPath = join(uiDir, `${name}.tsx`)
  if (existsSync(storyPath)) continue
  if (!existsSync(uiPath)) {
    skipped.push(`${name} (no ui/${name}.tsx)`)
    continue
  }

  // shadcn examples use `export default function XExample()`.
  const example = readFileSync(join(root, file), "utf8").match(
    /export\s+default\s+function\s+(\w+)/,
  )?.[1]
  const uiExports = exportsOf(readFileSync(uiPath, "utf8"))
  // Prefer the component named after the file; otherwise the first export that is a component.
  const component =
    uiExports.find((e) => e === pascal(name)) ??
    uiExports.find((e) => /^[A-Z]/.test(e) && !e.endsWith("Variants")) ??
    null
  if (!example || !component) {
    skipped.push(`${name} (example=${example}, component=${component})`)
    continue
  }

  writeFileSync(
    storyPath,
    `import type { Meta, StoryObj } from "@storybook/react-vite"
import ${example} from "../${name}-example"
import { ${component} } from "./${name}"

const meta = {
  title: "ui/${title(name)}",
  component: ${component},
  parameters: { layout: "padded" },
} satisfies Meta<typeof ${component}>

export default meta

export const Examples: StoryObj = {
  render: () => <${example} />,
}
`,
  )
  written++
}

console.log(`Wrote ${written} stories.`)
if (skipped.length) console.log(`Skipped:\n  ${skipped.join("\n  ")}`)
