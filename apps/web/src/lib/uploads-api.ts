import { payload, productClient, type ResponseBody } from "./product-client"

// Uploads (docs/storage.md): the person's avatar and an organization's logo. The bytes go to the
// product API as base64, which stores them in the server's file store and records the URL.

/** Whether uploads are on, and the size and types an image may be. */
export type UploadLimits = ResponseBody<"get_upload_limits">

export interface UploadsApi {
  limits(): Promise<UploadLimits>
  /** Stores the image as the signed-in person's avatar; returns its URL. */
  setAvatar(file: Blob): Promise<string>
  removeAvatar(): Promise<void>
  /** Stores the image as the organization's logo; returns its URL. */
  setLogo(organizationId: string, file: Blob): Promise<string>
  removeLogo(organizationId: string): Promise<void>
}

/** The file's bytes as base64, the form the upload operations take. */
export async function base64Of(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  // In chunks: String.fromCharCode with a whole image as arguments overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** The browser implementation, same origin as the page (the session cookie goes with every call). */
export function createUploadsApi(fetchImpl?: typeof fetch): UploadsApi {
  return {
    async limits() {
      return payload(productClient(undefined, fetchImpl).GET("/v1/uploads/limits"))
    },
    async setAvatar(file) {
      const body = { image: await base64Of(file) }
      const { image } = await payload(
        productClient(undefined, fetchImpl).PUT("/v1/me/avatar", { body }),
      )
      return image ?? ""
    },
    async removeAvatar() {
      await payload(productClient(undefined, fetchImpl).DELETE("/v1/me/avatar"))
    },
    async setLogo(organizationId, file) {
      const body = { image: await base64Of(file) }
      const { logo } = await payload(
        productClient(organizationId, fetchImpl).PUT("/v1/organization/logo", { body }),
      )
      return logo ?? ""
    },
    async removeLogo(organizationId) {
      await payload(productClient(organizationId, fetchImpl).DELETE("/v1/organization/logo"))
    },
  }
}

let shared: UploadsApi | undefined

/** The page's uploads API, created on first use in the browser. */
export function getUploadsApi(): UploadsApi {
  shared ??= createUploadsApi()
  return shared
}
