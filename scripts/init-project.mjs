#!/usr/bin/env node
// Usage: pnpm init-project <name> [github-owner] [--domain <domain>]
//   (e.g. acme -> @acme/ui, portless name "acme")
// The MCP registry only accepts a namespace you can prove. With --domain acme.com the registry name is
// com.acme/<name> (proved with a DNS record); otherwise io.github.<owner>/<name> (proved by signing in
// to GitHub), with the owner defaulting to the GitHub owner of the `origin` remote.
import { execSync } from "node:child_process"
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const USAGE =
  "Usage: pnpm init-project <name> [github-owner] [--domain <domain>]  (name: lowercase letters, digits, dashes)"
function fail(message) {
  console.error(message)
  process.exit(1)
}

const positional = []
let domain
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === "--domain") {
    domain = args[++i]
    if (domain === undefined || domain.startsWith("-")) fail(`--domain needs a value\n${USAGE}`)
  } else if (arg.startsWith("--domain=")) domain = arg.slice("--domain=".length)
  else if (arg.startsWith("-")) fail(`Unknown option: ${arg}\n${USAGE}`)
  else positional.push(arg)
}
const [name, ownerArg, extra] = positional
if (!name || extra !== undefined || !/^[a-z][a-z0-9-]*$/.test(name)) fail(USAGE)
if (domain !== undefined && ownerArg !== undefined) {
  fail("Pass a GitHub owner or --domain, not both: the registry name uses one namespace.")
}

function originOwner() {
  try {
    const url = execSync("git remote get-url origin", { stdio: ["ignore", "pipe", "ignore"] })
    return /github\.com[:/]([^/]+)\//.exec(url.toString())?.[1]
  } catch {
    return undefined
  }
}

let namespace
let host
if (domain !== undefined) {
  host = domain.toLowerCase().replace(/\.$/, "")
  const label = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
  const labels = host.split(".")
  if (labels.length < 2 || !labels.every((l) => label.test(l))) {
    fail(`Not a domain: ${domain} (e.g. acme.com, without https:// or a path)`)
  }
  namespace = labels.reverse().join(".")
} else {
  const owner = (ownerArg ?? originOwner())?.toLowerCase()
  if (owner && !/^[a-z0-9][a-z0-9-]*$/.test(owner)) fail(`Not a GitHub owner: ${owner}`)
  if (owner) namespace = `io.github.${owner}`
}
const registryName = namespace && `${namespace}/${name}`

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
  if (registryName) next = next.replaceAll("io.github.example/starter", registryName)
  if (next !== text) {
    writeFileSync(file, next)
    changed++
  }
}

console.log(`Renamed to "${name}" in ${changed} files.`)
if (registryName) console.log(`MCP registry name: ${registryName}`)
else
  console.warn(
    "No GitHub owner or --domain (pass one, or add an origin remote): the MCP registry name stays " +
      "io.github.example/starter. Change it in apps/api/src/server.ts before publishing.",
  )
if (host) {
  console.log(
    `Before publishing, prove ${host} to the registry with a DNS TXT record (mcp-publisher login dns).`,
  )
}
console.log("Refreshing lockfile…")
execSync("pnpm install", { stdio: "inherit" })
console.log("Done. Review `git diff`, then commit.")
