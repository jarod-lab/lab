import { AppError } from "@starter/errors"
import { AwsClient } from "aws4fetch"

import { assertFileKey, encodeKey, type FileStore, IMMUTABLE, keyUnder } from "./store"

export interface S3Config {
  driver: "s3"
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** Temporary credentials (an assumed role) carry one. */
  sessionToken?: string
  /**
   * An S3-compatible endpoint (MinIO, LocalStack), addressed path-style as `<endpoint>/<bucket>`.
   * Unset, AWS itself: `https://<bucket>.s3.<region>.amazonaws.com`.
   */
  endpoint?: string
  /** Where the files are read from (a CloudFront or custom domain). Unset, the bucket's own URL. */
  publicUrl?: string
  /** Tests pass one. */
  fetch?: typeof fetch
}

export interface R2Config {
  driver: "r2"
  /** The Cloudflare account id: R2's endpoint is `https://<accountId>.r2.cloudflarestorage.com`. */
  accountId: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /**
   * The bucket's public URL: its r2.dev address or a custom domain. Required: public access is
   * only through those, not the signed S3 endpoint.
   */
  publicUrl: string
  fetch?: typeof fetch
}

const trim = (url: string) => url.replace(/\/+$/, "")

/** S3, and anything that speaks its API: R2 is the same driver with Cloudflare's endpoint. */
export function createS3Store(config: S3Config | R2Config): FileStore {
  const r2 = config.driver === "r2"
  const region = r2 ? "auto" : config.region
  const bucketUrl = r2
    ? `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`
    : config.endpoint
      ? `${trim(config.endpoint)}/${config.bucket}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com`
  const publicUrl = trim(config.publicUrl ?? bucketUrl)
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: r2 ? undefined : config.sessionToken,
    service: "s3",
    region,
  })
  const send = config.fetch ?? fetch

  async function call(method: "PUT" | "DELETE", key: string, init: RequestInit = {}) {
    const request = await client.sign(`${bucketUrl}/${encodeKey(key)}`, { method, ...init })
    const res = await send(request)
    // A DELETE that finds the key already gone (404) counts as done.
    if (res.ok || (method === "DELETE" && res.status === 404)) return
    throw new AppError("INTERNAL", `The file store refused a ${method}`, {
      context: {
        driver: config.driver,
        status: res.status,
        body: (await res.text()).slice(0, 500),
      },
    })
  }

  return {
    driver: config.driver,
    origin: new URL(publicUrl).origin,
    async put(key, body, contentType) {
      assertFileKey(key)
      await call("PUT", key, {
        body,
        headers: {
          "content-type": contentType,
          "content-length": String(body.byteLength),
          "cache-control": IMMUTABLE,
        },
      })
      return `${publicUrl}/${encodeKey(key)}`
    },
    async delete(url) {
      const key = keyUnder(publicUrl, url)
      if (key === null) return false
      await call("DELETE", key)
      return true
    },
  }
}
