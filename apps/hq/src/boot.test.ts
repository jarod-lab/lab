import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createHqHarness, type TestPerson } from "./app.test.helpers"
import { prepareBoot } from "./boot"
import { isFounder, parseFounders } from "./data/founders"
import { founders } from "./db/schema"

// What server.ts does at start is `prepareBoot` and nothing else, so these are the tests of what a
// deployed hq refuses and ignores. Deleting either decision (the sign-up refusal, or pinning founders
// by id) reopens the N5 squatter.
describe("prepareBoot (real hq database on PGlite)", () => {
  let hq: Awaited<ReturnType<typeof createHqHarness>>
  let ann: TestPerson
  const at = new Date("2026-11-17T12:00:00Z")

  beforeAll(async () => {
    hq = await createHqHarness()
    // A verified account for the address the list names: by email it would be taken as a founder.
    ann = await hq.signUp("ann@example.com")
  })
  afterAll(() => hq.close())

  const boot = (nodeEnv: string | undefined, allowSignUp: boolean, list: string) =>
    prepareBoot({ nodeEnv, allowSignUp, founders: parseFounders(list) }, hq.db, at)

  for (const nodeEnv of ["production", undefined] as const) {
    describe(`a deployed hq (NODE_ENV ${nodeEnv === undefined ? "unset" : nodeEnv})`, () => {
      it("refuses to start with public sign-up on, and touches no founder", async () => {
        await expect(boot(nodeEnv, true, `id:${ann.userId}=UANN`)).rejects.toThrow(
          /HQ_ALLOW_SIGNUP is on in a deployed hq/,
        )
        expect(await hq.db.select().from(founders)).toEqual([])
      })

      it("skips an email= entry even for a verified account, and says which entry", async () => {
        const synced = await boot(nodeEnv, false, "ann@example.com=UANN")
        expect(synced.added).toEqual([])
        expect(synced.skipped).toEqual([
          { entry: 1, kind: "email", why: expect.stringMatching(/by id/) },
        ])
        expect(await isFounder(hq.db, ann.userId)).toBe(false)
        expect(await hq.db.select().from(founders)).toEqual([])
      })

      it("adds an id: entry, and an email= entry beside it changes nothing", async () => {
        const synced = await boot(nodeEnv, false, `id:${ann.userId}=UANN,bob@example.com=UBOB`)
        expect(synced.added).toEqual([ann.userId])
        expect(synced.skipped).toHaveLength(1)
        expect(await isFounder(hq.db, ann.userId)).toBe(true)
        // The same list at the next boot keeps her; dropping the entry removes her.
        expect((await boot(nodeEnv, false, `id:${ann.userId}=UANN`)).added).toEqual([])
        expect((await boot(nodeEnv, false, "")).removed).toEqual([ann.userId])
      })
    })
  }

  describe("a local stack (NODE_ENV development or test)", () => {
    for (const nodeEnv of ["development", "test"]) {
      it(`${nodeEnv}: keeps sign-up as configured and honours an email= entry for a verified account`, async () => {
        const synced = await boot(nodeEnv, true, "ann@example.com=UANN")
        expect(synced).toEqual({ added: [ann.userId], removed: [], skipped: [] })
        expect(await isFounder(hq.db, ann.userId)).toBe(true)
        await boot(nodeEnv, true, "")
      })
    }
  })
})
