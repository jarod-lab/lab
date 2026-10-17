import { createHmac } from "node:crypto"

// RFC 6238 time-based one-time passwords, computed in the test from the setup key the page shows (the
// authenticator app's job). SHA-1, 30-second steps, six digits: the defaults of the twoFactor plugin.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

/** RFC 4648 base32, as an authenticator's setup key is written. Spaces and padding are ignored. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, "").toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) throw new Error(`not a base32 character: ${char}`)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** The one-time code for `secret` at `at` (milliseconds since the epoch). */
export function totpAt(secret: string, at: number = Date.now(), digits = 6, step = 30): string {
  const counter = Math.floor(at / 1000 / step)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac("sha1", base32Decode(secret)).update(message).digest()
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f
  const binary =
    ((hmac[offset] ?? 0) & 0x7f) * 0x1000000 +
    ((hmac[offset + 1] ?? 0) & 0xff) * 0x10000 +
    ((hmac[offset + 2] ?? 0) & 0xff) * 0x100 +
    ((hmac[offset + 3] ?? 0) & 0xff)
  return String(binary % 10 ** digits).padStart(digits, "0")
}
