#!/usr/bin/env node
// Usage: pnpm init-project <name>   (e.g. acme -> @acme/ui, portless name "acme")
import { execSync } from "node:child_process"
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const name = process.argv[2]
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error("Usage: pnpm init-project <name>  (lowercase letters, digits, dashes)")
  process.exit(1)
}

const title = name
  .split("-")
  .map((w) => w[0].toUpperCase() + w.slice(1))
  .join(" ")

const SKIP = new Set(["node_modules", ".git", ".turbo", "dist", "pnpm-lock.yaml"])
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
  const next = text
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
  if (next !== text) {
    writeFileSync(file, next)
    changed++
  }
}

console.log(`Renamed to "${name}" in ${changed} files. Refreshing lockfile…`)
execSync("pnpm install", { stdio: "inherit" })
console.log("Done. Review `git diff`, then commit.")
