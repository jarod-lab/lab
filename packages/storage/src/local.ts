import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"

import {
  assertFileKey,
  assertFilesPrefix,
  contentTypeOfKey,
  encodeKey,
  type FileStore,
  isFileKey,
  keyUnder,
  type StoredFile,
  sweepable,
} from "./store"

export interface LocalConfig {
  driver: "local"
  /** The directory the files are written to. */
  dir: string
  /** The URL the API serves them at: `<API base URL>/files` (createApp mounts `GET /files/*`). */
  publicUrl: string
}

export interface MemoryConfig {
  driver: "memory"
  publicUrl: string
}

/**
 * The directory `prefix` names under `root`, or a throw when it resolves anywhere else. The prefix
 * guard already rules that out; this is the second lock before a recursive delete.
 */
export function dirUnder(root: string, prefix: string): string {
  const dir = resolve(root, prefix)
  if (!dir.startsWith(root + sep)) throw new Error(`Outside the store: ${JSON.stringify(prefix)}`)
  return dir
}

/** Files in one directory, served by the API itself. For development and single-server setups. */
export function createLocalStore(config: LocalConfig): FileStore {
  const root = resolve(config.dir)
  const publicUrl = config.publicUrl.replace(/\/+$/, "")
  // assertFileKey forbids `..` and absolute segments, so the path stays under root.
  const pathOf = (key: string) => join(root, ...key.split("/"))
  return {
    driver: "local",
    origin: new URL(publicUrl).origin,
    async put(key, body) {
      assertFileKey(key)
      const path = pathOf(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, body)
      return `${publicUrl}/${encodeKey(key)}`
    },
    async delete(url) {
      const key = keyUnder(publicUrl, url)
      if (key === null) return false
      await rm(pathOf(key), { force: true })
      return true
    },
    async deletePrefix(prefix) {
      assertFilesPrefix(prefix)
      const dir = dirUnder(root, prefix)
      let files: number
      try {
        // Counted before the directory goes; readdir lists subdirectories too.
        const entries = await readdir(dir, { recursive: true, withFileTypes: true })
        files = entries.filter((entry) => entry.isFile()).length
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { deleted: 0, skipped: 0 }
        throw error
      }
      await rm(dir, { recursive: true, force: true })
      return { deleted: files, skipped: 0 }
    },
    async read(key) {
      if (!isFileKey(key)) return null
      try {
        return {
          body: new Uint8Array(await readFile(pathOf(key))),
          contentType: contentTypeOfKey(key),
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      }
    },
  }
}

/** Files in a Map, served by the API like `local`. For tests. */
export function createMemoryStore(
  config: MemoryConfig,
): FileStore & { files: Map<string, StoredFile> } {
  const publicUrl = config.publicUrl.replace(/\/+$/, "")
  const files = new Map<string, StoredFile>()
  return {
    driver: "memory",
    origin: new URL(publicUrl).origin,
    files,
    async put(key, body, contentType) {
      assertFileKey(key)
      files.set(key, { body, contentType })
      return `${publicUrl}/${encodeKey(key)}`
    },
    async delete(url) {
      const key = keyUnder(publicUrl, url)
      if (key === null) return false
      files.delete(key)
      return true
    },
    async deletePrefix(prefix) {
      assertFilesPrefix(prefix)
      let deleted = 0
      // Deleting the entry being visited is safe while iterating a Map.
      for (const key of files.keys()) {
        if (!sweepable(key, prefix)) continue
        files.delete(key)
        deleted++
      }
      return { deleted, skipped: 0 }
    },
    async read(key) {
      return files.get(key) ?? null
    },
  }
}
