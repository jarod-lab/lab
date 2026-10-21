// e2e only: preloaded into the API by scripts/e2e-stack.mjs (node --import). Inbound support mail
// threads onto a ticket only when its DKIM signature checks out against the From domain's DNS, and
// the journeys' addresses (@example.com) publish no keys. A journey writes the public key it signs
// with to E2E_DKIM_DIR/<selector>.txt (`dkimSigned` in e2e/support/support.ts); this answers the
// TXT lookup for <selector>._domainkey.<domain> from that file, and passes every other lookup to
// DNS. Support's check itself is unchanged.
import { readFile } from "node:fs/promises"
import { Resolver } from "node:dns/promises"
import { join } from "node:path"

const dir = process.env.E2E_DKIM_DIR
const KEY = /^([a-z0-9]+)\._domainkey\./i
const resolve = Resolver.prototype.resolve

// Without a key directory there is nothing to answer: DNS as usual.
if (dir)
  Resolver.prototype.resolve = async function (hostname, rrtype) {
    const selector = rrtype === "TXT" ? KEY.exec(hostname)?.[1] : undefined
    if (selector) {
      try {
        return [[(await readFile(join(dir, `${selector.toLowerCase()}.txt`), "utf8")).trim()]]
      } catch {
        // Not a journey's key: ask DNS.
      }
    }
    return resolve.call(this, hostname, rrtype)
  }
