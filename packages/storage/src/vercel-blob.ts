import { AppError } from "@starter/errors"

import { assertFileKey, type FileStore, keyUnder } from "./store"

export interface VercelBlobConfig {
  driver: "vercel-blob"
  /** The store's read-write token (`vercel_blob_rw_<storeId>_...`), BLOB_READ_WRITE_TOKEN. */
  token: string
}

type BlobSdk = Pick<typeof import("@vercel/blob"), "put" | "del">

/** The store id inside a read-write token, which names the store's public host. */
function storeIdOf(token: string): string {
  const [vercel, blob, rw, storeId] = token.split("_")
  if (vercel !== "vercel" || blob !== "blob" || rw !== "rw" || !storeId) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not a Vercel Blob read-write token")
  }
  return storeId.toLowerCase()
}

/**
 * Vercel Blob, through `@vercel/blob`. The SDK is imported on first use, so deployments on another
 * store never load it. `sdk` is for tests.
 */
export function createVercelBlobStore(config: VercelBlobConfig, sdk?: BlobSdk): FileStore {
  const publicUrl = `https://${storeIdOf(config.token)}.public.blob.vercel-storage.com`
  let loaded: Promise<BlobSdk> | undefined
  const blob = () => {
    loaded ??= sdk ? Promise.resolve(sdk) : import("@vercel/blob")
    return loaded
  }
  const failed = (method: string, error: unknown) =>
    new AppError("INTERNAL", `The file store refused a ${method}`, {
      cause: error,
      context: { driver: "vercel-blob" },
    })

  return {
    driver: "vercel-blob",
    origin: publicUrl,
    async put(key, body, contentType) {
      assertFileKey(key)
      const { put } = await blob()
      try {
        const stored = await put(key, Buffer.from(body), {
          access: "public",
          contentType,
          token: config.token,
          // The key is already random and new per upload (newFileKey).
          addRandomSuffix: false,
          cacheControlMaxAge: 31_536_000,
        })
        return stored.url
      } catch (error) {
        throw failed("PUT", error)
      }
    },
    async delete(url) {
      // The host may come back in another case than the token's store id: `new URL` lowercases it.
      let normal: string
      try {
        normal = new URL(url).href
      } catch {
        return false
      }
      if (keyUnder(publicUrl, normal) === null) return false
      const { del } = await blob()
      try {
        await del(url, { token: config.token })
      } catch (error) {
        throw failed("DELETE", error)
      }
      return true
    },
  }
}
