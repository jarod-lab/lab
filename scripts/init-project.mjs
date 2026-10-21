#!/usr/bin/env node
// Usage: pnpm init-project <name> [github-owner] [--domain <domain>]
//   (e.g. acme -> @acme/ui; portless names app.acme and api.acme)
// The MCP registry only accepts a namespace you can prove. With --domain acme.com the registry name is
// com.acme/<name> (proved with a DNS record); otherwise io.github.<owner>/<name> (proved by signing in
// to GitHub), with the owner defaulting to the GitHub owner of the `origin` remote.
// Template-only text sits between a `template:start` and a `template:end` comment line (`#`, `//`,
// `<!--` or `{/*`); it is removed, along with this script, so the new repo carries no template setup.
import { execSync } from "node:child_process"
import { readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, sep } from "node:path"

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

// The GitHub owner: the repository's owner, and the registry namespace when there is no --domain.
const owner = (ownerArg ?? originOwner())?.toLowerCase()
if (owner && !/^[a-z0-9][a-z0-9-]*$/.test(owner)) fail(`Not a GitHub owner: ${owner}`)

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
  if (owner) namespace = `io.github.${owner}`
}
const registryName = namespace && `${namespace}/${name}`

const words = name.split("-").map((w) => w[0].toUpperCase() + w.slice(1))
const title = words.join(" ")
// The SDK's class names (AcmeError), env prefixes (ACME_CONFIG_DIR) and the database name, which
// `pnpm wt` needs as [a-z0-9_] to derive <db>_wt_<branch>.
const pascal = words.join("")
const constant = name.toUpperCase().replaceAll("-", "_")
const dbName = name.replaceAll("-", "_")

const SKIP = new Set(["node_modules", ".git", ".turbo", "dist", "pnpm-lock.yaml", "worktrees"])
// Vendored third-party skills (the ones in skills-lock.json) are not ours to rewrite; the other
// .claude/skills, such as agent-api, are. Local .env files hold secrets and are never read
// (.env.example, the template, is still renamed).
const VENDORED = new Set(Object.keys(JSON.parse(readFileSync("skills-lock.json", "utf8")).skills))
const SELF = "scripts/init-project.mjs"
// The public API origin (product.ts) is a placeholder until the domain is known. Only the files
// that carry it on purpose are rewritten: never a global replace, since the vendored schema, the
// storage tests and doc comments also say example.com.
const PLACEHOLDER_ORIGIN = "https://api.example.com"
const PLACEHOLDER_REPOSITORY = "https://github.com/example/starter"
const ORIGIN_FILES = new Set([
  join("apps", "api", "src", "product.ts"),
  join("skills", "starter", "SKILL.md"),
  "server.json",
  join("packages", "cli", "src", "main.ts"),
])
const REPOSITORY_FILES = new Set([
  join("apps", "api", "src", "product.ts"),
  "server.json",
  join("packages", "cli", "package.json"),
  join("packages", "sdk", "package.json"),
])
// The shipped skill's frontmatter `name` and prose follow the product, and so does its folder.
const SKILL = join("skills", "starter", "SKILL.md")
// Template history a new project has no use for.
const TEMPLATE_ONLY = [join("docs", "prompts"), SELF]
const MARK = String.raw`^[ \t]*(?:#|\/\/|<!--|\{\/\*)[ \t]*template:`
const TEMPLATE_BLOCK = new RegExp(String.raw`${MARK}start\b.*\n[\s\S]*?${MARK}end\b.*\n`, "gm")

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    if (entry.startsWith(".env") && entry !== ".env.example") continue
    const path = join(dir, entry)
    const [top, sub, skill] = path.split(sep)
    if (top === ".claude" && sub === "skills" && VENDORED.has(skill)) continue
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
    .replace(TEMPLATE_BLOCK, "")
    .replace(/^\s*"init-project": .*\n/m, "")
    .replaceAll(" `scripts/init-project.mjs`,", "")
    .replaceAll("@starter/", `@${name}/`)
    .replace(/("name": ")starter(")/g, `$1${name}$2`)
    .replace(/("name": "(?:api|app|site)\.)starter(")/g, `$1${name}$2`)
    .replace(/^# starter$/m, `# ${name}`)
    .replace(/(name = ")starter(")/g, `$1${name}$2`)
    .replaceAll("localhost:5432/starter", `localhost:5432/${dbName}`)
    // compose's DATABASE_URL points at the same database as POSTGRES_DB.
    .replace(/(@db:5432\/)starter\b/g, `$1${dbName}`)
    .replace(/POSTGRES_DB: starter/g, `POSTGRES_DB: ${dbName}`)
    .replace(/-d starter/g, `-d ${dbName}`)
    .replace(/\bstarter_wt_/g, `${dbName}_wt_`)
    // compose's project name, which worktrees share.
    .replace(/^name: starter$/m, `name: ${name}`)
    // Hostnames in comments, docs and env examples (portless.json names them the same way). The
    // bare parent domain is the passkey rpID that auth's tests expect.
    .replace(/\b(app|api|site)\.starter\b/g, `$1.${name}`)
    .replace(/\bstarter\.localhost\b/g, `${name}.localhost`)
    // Worktree folders are siblings named after the checkout (`pnpm wt`).
    .replace(/\.\.\/starter\./g, `../${name}.`)
    // The display name as a whole word ("Starter API", "Starter"). "for Starter" and "your Starter
    // account" are the app name in auth-flows' expected email subjects.
    .replace(/"Starter(?=[ "])/g, `"${title}`)
    .replace(/\bStarter API\b/g, `${title} API`)
    .replace(/\b(for|your) Starter\b/g, `$1 ${title}`)
    .replaceAll("Starter <", `${title} <`)
    // The SDK's public names. Only these: `RunStarter`, `runStarterUserId` and "the run's starter"
    // mean the person who started a run.
    .replace(/\bStarter(?=(?:Error|ErrorInit|Client)\b)/g, pascal)
    .replace(/\btoStarterError\b/g, `to${pascal}Error`)
    .replace(/\bSTARTER_(?=[A-Z])/g, `${constant}_`)
    // Identifiers: better-auth plugin ids, HKDF and HMAC labels, baseline rule ids, the client-IP
    // header, temp-dir prefixes, the image tag, the theme storage key and an audit actor.
    .replace(/\bstarter-(?=[a-z])/g, `${name}-`)
    .replace(/\bstarter(?=\\?[.:](?:theme|access-ended)\b)/g, name)
    // The CLI: its bin, its commands in help and hints, its OAuth client name and its config dir.
    .replace(/"starter"(?=: "(?:\.\/dist\/bin\.js|node dist\/bin\.js)")/g, `"${name}"`)
    .replace(/\bstarter(?= (?:login|logout|whoami|ops|call|--help|CLI)\b)/g, name)
    .replace(/(?<=binary )`starter`|`starter`(?= (?:command|bin)\b)/g, `\`${name}\``)
    .replace(/^const HELP = `starter:/m, `const HELP = \`${name}:`)
    .replace(/(\.config|\bxdg|\bXDG_CONFIG_HOME)\/starter\b/g, `$1/${name}`)
    .replace(/"\.config"\), "starter"\)/g, `".config"), "${name}")`)
    .replace(/\bskills\/starter\b/g, `skills/${name}`)
  if (file === SKILL) {
    next = next.replace(/^name: starter$/m, `name: ${name}`).replace(/\bStarter\b/g, title)
  }
  // The registry name in product.ts, its fallback and the committed server.json stay in step.
  if (registryName) next = next.replaceAll("io.github.example/starter", registryName)
  if (domain !== undefined && ORIGIN_FILES.has(file)) {
    next = next.replaceAll(PLACEHOLDER_ORIGIN, `https://api.${host}`)
  }
  if (owner && REPOSITORY_FILES.has(file)) {
    next = next.replaceAll(PLACEHOLDER_REPOSITORY, `https://github.com/${owner}/${name}`)
  }
  if (next !== text) {
    writeFileSync(file, next)
    changed++
  }
}

renameSync(join("skills", "starter"), join("skills", name))
for (const path of TEMPLATE_ONLY) rmSync(path, { recursive: true, force: true })

console.log(`Renamed to "${name}" in ${changed} files (database ${dbName}, skills/${name}).`)
if (registryName) console.log(`MCP registry name: ${registryName}`)
else
  console.warn(
    "No GitHub owner or --domain (pass one, or add an origin remote): the MCP registry name stays " +
      "io.github.example/starter. Change it in apps/api/src/product.ts before publishing.",
  )
if (domain === undefined) {
  console.warn(
    `The public API URL stays ${PLACEHOLDER_ORIGIN} (apps/api/src/product.ts, the shipped skill, ` +
      "server.json, packages/cli). Pass --domain <domain>, or set publicURL in " +
      "apps/api/src/product.ts, before publishing.",
  )
}
if (!owner) {
  console.warn(
    `The repository stays ${PLACEHOLDER_REPOSITORY}: pass a GitHub owner, or add an origin remote, ` +
      "or set registry.repository in apps/api/src/product.ts.",
  )
}
if (host) {
  console.log(
    `Before publishing, prove ${host} to the registry with a DNS TXT record (mcp-publisher login dns).`,
  )
}
// The workspace's package names changed, so the lockfile must be rewritten (pnpm freezes it under CI).
console.log("Refreshing lockfile…")
execSync("pnpm install --no-frozen-lockfile", { stdio: "inherit" })
// Renamed imports change line lengths, which the formatter (and the pre-commit hook) would reject.
execSync("pnpm format", { stdio: "inherit" })
console.log("Done. Review `git diff`, then commit. This script has removed itself.")
