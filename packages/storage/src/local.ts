import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

import {
  assertFileKey,
  contentTypeOfKey,
  encodeKey,
  type FileStore,
  isFileKey,
  keyUnder,
  type StoredFile,
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
    async read(key) {
      return files.get(key) ?? null
    },
  }
}
