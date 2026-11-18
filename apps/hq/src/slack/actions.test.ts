import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  createHqHarness,
  slackFormBody,
  TEST_SLACK_SECRET,
  TEST_SLACK_TEAM,
  type TestPerson,
} from "../app.test.helpers"
import { founders } from "../db/schema"
import { createSlackActionHandler, grantActionId, parseActionId, proposalActionId } from "./actions"
import { slackSignature } from "./verify"

// A founder's click on a Slack card, through hq's real app on in-process Postgres. The click is
// signed the way Slack signs it; the agent's job (forwarding the bytes) is tested in the agent.

describe("Slack actions (real hq on PGlite)", () => {
  let hq: Awaited<ReturnType<typeof createHqHarness>>
  let founder: TestPerson
  let founderSlack: string
  let agentKey: { key: string }

  beforeAll(async () => {
    hq = await createHqHarness({ founderEmails: ["founder@example.com"] })
    founder = await hq.signUp("founder@example.com")
    founderSlack = "UFOUNDER"
    await hq.addFounder(founder, founderSlack)
    // Exactly the agent's scope: it proposes and reads, it never decides.
    agentKey = {
      key: await hq.keyFor(founder, {
        hq_entry: ["read"],
        hq_proposal: ["read", "create"],
        hq_run: ["read", "create", "update"],
        hq_spend: ["read", "record"],
      }),
    }
  })
  afterAll(() => hq.close())

  let n = 0
  /** A pending proposal from the agent: the card's proposal id and the version it names. */
  async function propose(slug = `price-${++n}`, text = "Free, then $20 per seat.") {
    const res = await hq.call(agentKey, "POST", "/v1/proposals", {
      kind: "fact",
      slug,
      title: `Pricing ${slug}`,
      body: { text },
      reason: "heard in Slack",
    })
    expect(res.status).toBe(200)
    return res.body.proposalId
  }
  const proposalOf = async (id: string) =>
    (await hq.call({ cookie: founder.cookie }, "GET", "/v1/proposals")).body.proposals.find(
      (p) => p.id === id,
    )
  const allowance = async () =>
    (await hq.call(agentKey, "GET", "/v1/spend/allowance")).body as unknown as {
      grantedUsd: number
      remainingUsd: number
    }
  const approve = (id: string, version: number | null = null) =>
    proposalActionId("approve", id, version)

  it("a founder's approve click approves the proposal", async () => {
    const id = await propose()
    const click = await hq.slackClick({ slackUserId: founderSlack, actionId: approve(id) })
    expect(click.status).toBe(200)
    expect(click.text).toMatch(/^Approved: /)
    const after = await proposalOf(id)
    expect(after?.status).toBe("approved")
    // Decided as the founder the Slack user maps to, never as the forwarding key.
    expect(after?.decidedBy).toBe(founder.userId)
    expect(after?.entryId).not.toBeNull()
  })

  it("a founder's reject click rejects it and writes no entry", async () => {
    const id = await propose()
    const click = await hq.slackClick({
      slackUserId: founderSlack,
      actionId: proposalActionId("reject", id, null),
    })
    expect(click.status).toBe(200)
    const after = await proposalOf(id)
    expect(after?.status).toBe("rejected")
    expect(after?.entryId).toBeNull()
  })

  it("a non-founder's click returns 403 and leaves it pending", async () => {
    const id = await propose()
    // A real workspace member, valid signature, no founders row.
    const click = await hq.slackClick({ slackUserId: "UNOTFOUNDER", actionId: approve(id) })
    expect(click.status).toBe(403)
    const after = await proposalOf(id)
    expect(after?.status).toBe("pending")
    expect(after?.decidedBy).toBeNull()
    expect(after?.entryId).toBeNull()
  })

  it("a replayed click after decision returns 409", async () => {
    const id = await propose()
    const first = await hq.slackClick({ slackUserId: founderSlack, actionId: approve(id) })
    expect(first.status).toBe(200)
    const decided = await proposalOf(id)

    // The identical request again: the same bytes, the same signature, inside the 5 minutes.
    const timestamp = first.timestamp
    const replay = await hq.app.request("http://localhost:3100/v1/slack/actions", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": slackSignature(TEST_SLACK_SECRET, timestamp, first.rawBody),
      },
      body: first.rawBody,
    })
    expect(replay.status).toBe(409)
    // And a fresh click on the decided card, a reject this time: nothing changes.
    const again = await hq.slackClick({
      slackUserId: founderSlack,
      actionId: proposalActionId("reject", id, null),
    })
    expect(again.status).toBe(409)
    expect(await proposalOf(id)).toEqual(decided)
  })

  it("a bad signature returns 403", async () => {
    const id = await propose()
    const goodTimestamp = String(Math.floor(hq.now().getTime() / 1000))
    const cases = [
      { signature: `v0=${"0".repeat(64)}` },
      { signature: slackSignature("another-secret", goodTimestamp, "x") },
      { signature: null },
      { signature: "" },
      // Stale by a minute past five, and from the future by more than one.
      { signedAt: new Date(hq.now().getTime() - 301_000) },
      { signedAt: new Date(hq.now().getTime() + 61_000) },
    ]
    for (const c of cases) {
      const click = await hq.slackClick({
        slackUserId: founderSlack,
        actionId: approve(id),
        ...c,
      })
      expect(click.status, JSON.stringify(c)).toBe(403)
    }
    expect((await proposalOf(id))?.status).toBe("pending")
  })

  it("is verified over the exact bytes: the same click re-encoded differently is refused", async () => {
    const id = await propose()
    const body = slackFormBody({
      type: "block_actions",
      team: { id: TEST_SLACK_TEAM },
      user: { id: founderSlack },
      actions: [{ action_id: approve(id), action_ts: "1.1" }],
    })
    const timestamp = String(Math.floor(hq.now().getTime() / 1000))
    const signature = slackSignature(TEST_SLACK_SECRET, timestamp, body)
    const send = (rawBody: string) =>
      hq.slackClick({
        slackUserId: founderSlack,
        actionId: approve(id),
        rawBody,
        signature,
      })
    // Signed for `body`; the same data with its percent-escapes spelled in lower case is not it.
    const reencoded = body.replace(/%7B/g, "%7b")
    expect(reencoded).not.toBe(body)
    expect((await send(reencoded)).status).toBe(403)
    expect((await send(`${body}&extra=1`)).status).toBe(403)
    expect((await proposalOf(id))?.status).toBe("pending")
    expect((await send(body)).status).toBe(200)
  })

  it("a click from another workspace is refused, however well signed", async () => {
    const id = await propose()
    const click = await hq.slackClick({
      slackUserId: founderSlack,
      actionId: approve(id),
      teamId: "TOTHERTEAM",
    })
    expect(click.status).toBe(403)
    expect((await proposalOf(id))?.status).toBe("pending")
  })

  it("refuses a signed payload that is not one of hq's button clicks", async () => {
    const id = await propose()
    const bodies = [
      "not a form",
      slackFormBody({ type: "view_submission", user: { id: founderSlack } }),
      slackFormBody({
        type: "block_actions",
        team: { id: TEST_SLACK_TEAM },
        user: { id: founderSlack },
        actions: [],
      }),
      // Two actions at once: which one is meant is not for hq to guess.
      slackFormBody({
        type: "block_actions",
        team: { id: TEST_SLACK_TEAM },
        user: { id: founderSlack },
        actions: [{ action_id: approve(id) }, { action_id: approve(id) }],
      }),
      slackFormBody({
        type: "block_actions",
        team: { id: TEST_SLACK_TEAM },
        user: { id: founderSlack },
        actions: [{ action_id: "eve_input:whatever" }],
      }),
    ]
    for (const rawBody of bodies) {
      const click = await hq.slackClick({ slackUserId: founderSlack, actionId: "x", rawBody })
      expect(click.status, rawBody).toBe(403)
    }
    expect((await proposalOf(id))?.status).toBe("pending")
  })

  it("a founder removed from the table can no longer click", async () => {
    const other = await hq.signUp("leaving@example.com")
    await hq.addFounder(other, "ULEAVING")
    const id = await propose()
    await hq.db.delete(founders).where(eq(founders.userId, other.userId))
    const click = await hq.slackClick({ slackUserId: "ULEAVING", actionId: approve(id) })
    expect(click.status).toBe(403)
    expect((await proposalOf(id))?.status).toBe("pending")
  })

  describe("a stale card", () => {
    async function approvedEntry(slug: string) {
      const id = await propose(slug, "Version one.")
      expect(
        (await hq.slackClick({ slackUserId: founderSlack, actionId: approve(id) })).status,
      ).toBe(200)
      return (await proposalOf(id))?.entryId as string
    }

    it("approving after the entry was edited is the same CONFLICT as decide_proposal, and writes nothing", async () => {
      const entryId = await approvedEntry("stale-entry")
      // A proposal against version 1, then a founder edits the entry to version 2.
      const res = await hq.call(agentKey, "POST", "/v1/proposals", {
        kind: "fact",
        slug: "stale-entry",
        title: "Pricing stale-entry",
        body: { text: "Version one, per the agent." },
        reason: "r",
        baseVersion: 1,
      })
      const proposalId = res.body.proposalId
      const edited = await hq.call(
        { cookie: founder.cookie },
        "POST",
        `/v1/entries/${entryId}/versions`,
        { title: "Edited", body: { text: "Version two, by a founder." }, baseVersion: 1 },
      )
      expect(edited.status).toBe(200)

      const click = await hq.slackClick({
        slackUserId: founderSlack,
        actionId: proposalActionId("approve", proposalId, 1),
      })
      expect(click.status).toBe(409)
      // The same refusal the founder gets deciding it over the API.
      const viaApi = await hq.call(
        { cookie: founder.cookie },
        "POST",
        `/v1/proposals/${proposalId}/decision`,
        { decision: "approve" },
      )
      expect(viaApi.status).toBe(409)
      expect(viaApi.body.error.code).toBe("CONFLICT")
      expect(click.text).toBe(viaApi.body.error.message)

      // Nothing was overwritten: the founder's version 2 is still the latest.
      const entry = await hq.call({ cookie: founder.cookie }, "GET", `/v1/entries/${entryId}`)
      expect(entry.body.latestVersion).toBe(2)
      expect(entry.body.body.text).toBe("Version two, by a founder.")
      expect((await proposalOf(proposalId))?.status).toBe("pending")
    })

    it("a card that names another version than the proposal's is out of date", async () => {
      await approvedEntry("version-mismatch")
      const res = await hq.call(agentKey, "POST", "/v1/proposals", {
        kind: "fact",
        slug: "version-mismatch",
        title: "Pricing version-mismatch",
        body: { text: "An update." },
        reason: "r",
        baseVersion: 1,
      })
      const click = await hq.slackClick({
        slackUserId: founderSlack,
        actionId: proposalActionId("approve", res.body.proposalId, 7),
      })
      expect(click.status).toBe(409)
      expect(click.text).toMatch(/out of date/)
      expect((await proposalOf(res.body.proposalId))?.status).toBe("pending")
    })

    it("an unknown proposal is a 409, not a crash", async () => {
      const click = await hq.slackClick({
        slackUserId: founderSlack,
        actionId: approve("does-not-exist"),
      })
      expect(click.status).toBe(409)
    })
  })

  describe("a spend grant", () => {
    it("a founder's click grants once; the same request replayed or clicked again grants nothing more", async () => {
      const before = (await allowance()).grantedUsd
      const request = "bigger-model-req-1"
      const first = await hq.slackClick({
        slackUserId: founderSlack,
        actionId: grantActionId(true, request, 500),
      })
      expect(first.status).toBe(200)
      expect((await allowance()).grantedUsd).toBe(before + 5)

      // The identical bytes again.
      const timestamp = first.timestamp
      const replay = await hq.app.request("http://localhost:3100/v1/slack/actions", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-slack-request-timestamp": timestamp,
          "x-slack-signature": slackSignature(TEST_SLACK_SECRET, timestamp, first.rawBody),
        },
        body: first.rawBody,
      })
      expect(replay.status).toBe(409)
      // A second click (another action_ts) on the same request, even by another founder.
      const again = await hq.slackClick({
        slackUserId: founderSlack,
        actionId: grantActionId(true, request, 500),
        actionTs: "9999999999.000100",
      })
      expect(again.status).toBe(409)
      expect((await allowance()).grantedUsd).toBe(before + 5)
    })

    it("two clicks at once on one request grant once", async () => {
      const before = (await allowance()).grantedUsd
      const clicks = await Promise.all(
        [1, 2, 3].map(() =>
          hq.slackClick({
            slackUserId: founderSlack,
            actionId: grantActionId(true, "bigger-model-req-race", 300),
          }),
        ),
      )
      expect(clicks.map((c) => c.status).sort()).toEqual([200, 409, 409])
      expect((await allowance()).grantedUsd).toBe(before + 3)
    })

    it("a non-founder's grant click is 403 and grants nothing; a denied request cannot be approved later", async () => {
      const before = (await allowance()).grantedUsd
      const stranger = await hq.slackClick({
        slackUserId: "UNOTFOUNDER",
        actionId: grantActionId(true, "req-stranger", 500),
      })
      expect(stranger.status).toBe(403)
      const deny = await hq.slackClick({
        slackUserId: founderSlack,
        actionId: grantActionId(false, "req-denied", 500),
      })
      expect(deny.status).toBe(200)
      const late = await hq.slackClick({
        slackUserId: founderSlack,
        actionId: grantActionId(true, "req-denied", 500),
      })
      expect(late.status).toBe(409)
      expect((await allowance()).grantedUsd).toBe(before)
      // The stranger's request is still open for a founder.
      expect(
        (
          await hq.slackClick({
            slackUserId: founderSlack,
            actionId: grantActionId(true, "req-stranger", 500),
          })
        ).status,
      ).toBe(200)
    })

    it("a click can grant at most the ceiling", async () => {
      const before = (await allowance()).grantedUsd
      const click = await hq.slackClick({
        slackUserId: founderSlack,
        actionId: grantActionId(true, "req-huge", 2501),
      })
      expect(click.status).toBe(403)
      expect((await allowance()).grantedUsd).toBe(before)
      expect(
        (
          await hq.slackClick({
            slackUserId: founderSlack,
            actionId: grantActionId(true, "req-max", 2500),
          })
        ).status,
      ).toBe(200)
    })
  })

  describe("the agent's key", () => {
    it("is not a credential for the Slack route: with no Slack signature the key changes nothing", async () => {
      const id = await propose()
      const res = await hq.slackClick({
        slackUserId: founderSlack,
        actionId: approve(id),
        signature: null,
        headers: { "x-api-key": agentKey.key },
      })
      expect(res.status).toBe(403)
      expect((await proposalOf(id))?.status).toBe("pending")
    })

    it("still cannot decide a proposal or grant spend over the API", async () => {
      const id = await propose()
      const decide = await hq.call(agentKey, "POST", `/v1/proposals/${id}/decision`, {
        decision: "approve",
      })
      expect(decide.status).toBe(403)
      const grant = await hq.call(agentKey, "POST", "/v1/spend/grants", {
        amountUsd: 5,
        reason: "the agent grants itself",
      })
      expect(grant.status).toBe(403)
      expect((await proposalOf(id))?.status).toBe("pending")
    })

    it("a valid click is decided as the founder, not the key's owner by default", async () => {
      // The key belongs to the founder's organization, yet a click by a second founder records
      // that second founder.
      const second = await hq.signUp("second@example.com")
      await hq.addFounder(second, "USECOND")
      const id = await propose()
      const click = await hq.slackClick({ slackUserId: "USECOND", actionId: approve(id) })
      expect(click.status).toBe(200)
      expect((await proposalOf(id))?.decidedBy).toBe(second.userId)
    })
  })

  it("refuses everything when hq has no signing secret or no workspace configured", async () => {
    for (const config of [
      { signingSecret: undefined, teamId: TEST_SLACK_TEAM },
      { signingSecret: TEST_SLACK_SECRET, teamId: undefined },
      { signingSecret: "", teamId: TEST_SLACK_TEAM },
    ]) {
      const handle = createSlackActionHandler({ db: hq.db, now: hq.now, ...config })
      const id = await propose()
      const body = slackFormBody({
        type: "block_actions",
        team: { id: TEST_SLACK_TEAM },
        user: { id: founderSlack },
        actions: [{ action_id: approve(id) }],
      })
      const timestamp = String(Math.floor(hq.now().getTime() / 1000))
      const result = await handle({
        rawBody: body,
        timestamp,
        signature: slackSignature(TEST_SLACK_SECRET, timestamp, body),
      })
      expect(result.status).toBe(403)
      expect((await proposalOf(id))?.status).toBe("pending")
    }
  })
})

describe("the card action ids", () => {
  it("round-trip: the id carries the proposal and the version it was proposed against", () => {
    expect(parseActionId(proposalActionId("approve", "p-1", 3))).toEqual({
      kind: "proposal",
      decision: "approve",
      proposalId: "p-1",
      baseVersion: 3,
    })
    expect(parseActionId(proposalActionId("reject", "p-2", null))).toEqual({
      kind: "proposal",
      decision: "reject",
      proposalId: "p-2",
      baseVersion: null,
    })
    expect(parseActionId(grantActionId(true, "req_9", 1250))).toEqual({
      kind: "grant",
      approve: true,
      requestId: "req_9",
      cents: 1250,
    })
  })

  it("refuses anything else", () => {
    for (const id of [
      "",
      "hq_proposal_approve:p:0",
      "hq_proposal_approve:p:01",
      "hq_proposal_approve::1",
      "hq_proposal_approve:p q:1",
      "hq_proposal_delete:p:1",
      "hq_grant_approve:r:0",
      "hq_grant_approve:r:12.5",
      "eve_input:hq_proposal_approve:p:1",
      `hq_proposal_approve:${"a".repeat(65)}:1`,
    ]) {
      expect(parseActionId(id), id).toBeNull()
    }
  })
})
