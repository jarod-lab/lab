const DEFAULT_NEXT = "/digest"
// A path inside the app: one leading slash (never `//host`), and no whitespace, backslash or colon
// (`/\evil`, `/https://evil` and `javascript:` all fail). `?` and `#` may follow.
const INSIDE_THE_APP = /^\/(?!\/)[^\s\\:]*$/

/** Where to go after sign-in: `next` when it is a path inside the app, else the Digest. */
export function safeNext(next: string | undefined): string {
  return typeof next === "string" && INSIDE_THE_APP.test(next) ? next : DEFAULT_NEXT
}
