#!/usr/bin/env node
// Usage: pnpm init-project <name> [github-owner]   (e.g. acme -> @acme/ui, portless name "acme")
// The MCP registry name becomes io.github.<owner>/<name>. The owner defaults to the GitHub owner of
// the `origin` remote; the registry only accepts a namespace you can sign in as.
import { execSync } from "node:child_process"
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const name = process.argv[2]
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error(
    "Usage: pnpm init-project <name> [github-owner]  (lowercase letters, digits, dashes)",
  )
  process.exit(1)
}

function originOwner() {
  try {
    const url = execSync("git remote get-url origin", { stdio: ["ignore", "pipe", "ignore"] })
    return /github\.com[:/]([^/]+)\//.exec(url.toString())?.[1]
  } catch {
    return undefined
  }
}
const owner = (process.argv[3] ?? originOwner())?.toLowerCase()
if (owner && !/^[a-z0-9][a-z0-9-]*$/.test(owner)) {
  console.error(`Not a GitHub owner: ${owner}`)
  process.exit(1)
}

const title = name
  .split("-")
  .map((w) => w[0].toUpperCase() + w.slice(1))
  .join(" ")

const SKIP = new Set(["node_modules", ".git", ".turbo", "dist", "pnpm-lock.yaml", "worktrees"])
const SELF = "scripts/init-project.mjs"

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

let changed = 0
for (const file of walk(".")) {
  if (file === SELF) continue
  let text
  try {
    text = readFileSync(file, "utf8")
  } catch {
    continue
  }
  let next = text
    .replaceAll("@starter/", `@${name}/`)
    .replace(/("name": ")starter(")/g, `$1${name}$2`)
    .replace(/^# starter$/m, `# ${name}`)
    .replace(/(name = ")starter(")/g, `$1${name}$2`)
    .replaceAll("localhost:5432/starter", `localhost:5432/${name}`)
    .replace(/POSTGRES_DB: starter/g, `POSTGRES_DB: ${name}`)
    .replace(/-d starter/g, `-d ${name}`)
    .replace(/^New project from this template:.*\n/m, "")
    .replaceAll('"Starter', `"${title}`)
    .replaceAll("Starter <", `${title} <`)
  // The registry name in server.ts, its fallback and the committed server.json stay in step.
  if (owner) next = next.replaceAll("io.github.example/starter", `io.github.${owner}/${name}`)
  if (next !== text) {
    writeFileSync(file, next)
    changed++
  }
}

console.log(`Renamed to "${name}" in ${changed} files.`)
if (owner) console.log(`MCP registry name: io.github.${owner}/${name}`)
else
  console.warn(
    "No GitHub owner (pass one, or add an origin remote): the MCP registry name stays " +
      "io.github.example/starter. Change it in apps/api/src/server.ts before publishing.",
  )
console.log("Refreshing lockfile…")
execSync("pnpm install", { stdio: "inherit" })
console.log("Done. Review `git diff`, then commit.")
