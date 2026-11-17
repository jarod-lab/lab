import { defaultSlackAuth, defineSlackRenderer, slackChannel } from "eve/channels/slack"
import { log } from "../lib/log.js"
import { allowedSlackAuth } from "../lib/slack/policy.js"
import { postCapRefusal } from "../lib/slack/refusal.js"
import { sessionSpendStore } from "../lib/spend/state.js"

/**
 * The Slack channel: mentions and DMs in, replies, approvals and the cap refusal out.
 *
 * @remarks
 * Credentials are eve's portable ones, `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`, from the org's
 * vault. Inbound is limited to people from SLACK_ALLOWED_TEAM_IDS in every handler, including
 * `onAnswers`, so someone who cannot start a turn cannot resume one by clicking a button
 * (`agent/lib/slack/policy.ts`). Who may approve a bigger model is the tool's own founder-only
 * response policy; the click that grants spend in hq is Task 8.
 *
 * The `capRefusal` renderer posts the refusal text when `agent/hooks/spend.ts` cancels a turn.
 */
const capRefusal = defineSlackRenderer({
  events: {
    async "turn.settled"(event, ctx, next) {
      await next()
      try {
        await postCapRefusal(event, ctx.channel.thread, sessionSpendStore)
      } catch (error) {
        log.warn("slack: could not post the cap refusal", error)
      }
    },
  },
})

export default slackChannel({
  botName: "Org agent",
  onAppMention(ctx, message) {
    if (message.author?.isBot !== false) {
      return null
    }
    const auth = allowedSlackAuth(defaultSlackAuth(message, ctx))
    return auth === null ? null : { auth }
  },
  onDirectMessage(ctx, message) {
    if (message.author?.isBot !== false) {
      return null
    }
    const auth = allowedSlackAuth(defaultSlackAuth(message, ctx))
    return auth === null ? null : { auth }
  },
  onAnswers(ctx) {
    const auth = allowedSlackAuth(ctx.defaultAuth)
    return auth === null ? null : { auth }
  },
  renderers: [capRefusal],
})
