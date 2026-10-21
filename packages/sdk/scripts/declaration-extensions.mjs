// Adds .js to the relative imports of the emitted declarations (dist/**/*.d.ts). The source imports
// extensionless paths (Bundler resolution), which tsc copies into the .d.ts files; a consumer on
// `moduleResolution: nodenext` cannot resolve those. The runtime bundle has no relative imports.
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const DIST = fileURLToPath(new URL("../dist/", import.meta.url))
const SPECIFIER = /((?:from|import)\s*\(?\s*)"(\.{1,2}\/[^"]+)"/g

export function withJsExtension(specifier) {
  return /\.(?:[cm]?js|json)$/.test(specifier) ? specifier : `${specifier}.js`
}

export function addExtensions(text) {
  return text.replace(SPECIFIER, (_, lead, specifier) => `${lead}"${withJsExtension(specifier)}"`)
}

async function declarationsIn(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await declarationsIn(path)))
    else if (entry.name.endsWith(".d.ts")) found.push(path)
  }
  return found
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of await declarationsIn(DIST)) {
    const before = await readFile(file, "utf8")
    const after = addExtensions(before)
    if (after !== before) await writeFile(file, after)
  }
}
