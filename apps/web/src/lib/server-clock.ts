// The server's clock, as far as this browser can tell. Every product API response carries a `Date`
// header (second precision); the difference from the local clock at receipt is the skew. Countdowns
// that the server sets (an approval's undo window) are measured with it, so a browser whose clock
// runs fast or slow still shows the time the server will actually enforce.

let skewMs = 0

/** Records the skew from one response. Ignored when the header is missing or unparseable. */
export function recordServerDate(dateHeader: string | null, receivedAtMs: number = Date.now()) {
  if (!dateHeader) return
  const serverMs = Date.parse(dateHeader)
  if (Number.isNaN(serverMs)) return
  skewMs = serverMs - receivedAtMs
}

/** The server's current time, estimated from the local clock and the last recorded skew. */
export function serverNowMs(localNowMs: number = Date.now()): number {
  return localNowMs + skewMs
}

/** The skew in milliseconds (positive when the local clock is behind the server). For tests. */
export function currentSkewMs(): number {
  return skewMs
}

/** Test helper: forgets any recorded skew. */
export function resetServerClock() {
  skewMs = 0
}
