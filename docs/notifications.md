# Notifications

In-app notifications come from [@byo-oss/notifications](https://github.com/byo-oss/notifications), a
better-auth plugin. A **notification** (GLOSSARY) is a row in the `notification` table addressed to
one user. A row that is about an organization is stamped with that organization's id. The top bar's
bell lists a person's notifications. It is separate from the **Inbox**, which is the count of runs
that need you.

## Pieces

- `packages/auth/src/index.ts` mounts `inbox()`. `packages/auth/src/client.ts` adds
  `inboxClient()`. The routes are `GET /api/auth/inbox/list`, `GET /api/auth/inbox/unread-count`,
  `POST /api/auth/inbox/mark-read`, `POST /api/auth/inbox/mark-seen` and
  `POST /api/auth/inbox/mark-all-read`. They are session-only and scoped to the caller. An
  impersonated session can list but not mark anything read or seen (`guards.ts`).
- `auth.api.notify` is server-only, never an HTTP route. Don't call it directly. Send through the
  catalog:
  - `packages/auth/src/notifications.ts` is the event catalog (`NotificationEvent`).
    `renderNotification` turns an event into a title, body and link, and `recipientsOf` chooses
    who gets it. `createNotifier(...).send` delivers.
  - `packages/auth/src/notify-hooks.ts` holds the better-auth hooks that emit the auth-side events.
  - `apps/api/src/notifications.ts` is `createApiNotifier`, for operations and invoke hooks. An
    org event needs the caller's `OrganizationId` proof:
    `inCallerOrg(caller, (org, proof) => notifier.inOrg(org, proof, event))`.
- `packages/ui/src/dplus/shell/notifications-menu.tsx` is the bell and panel (presentational).
  `apps/app/src/containers/notifications.tsx` wires it to @byo-oss/notifications' `useInbox`. It polls the
  unread count every 30 s, paused while the tab is hidden, and refreshes the list whenever the
  bell opens.

## Email

Some events also email the person, through their own SES with Wraps, in the auth emails' layout.
The **email** column below says which. `packages/auth/src/notification-email.ts` is the channel:
`mailerChannel` (@byo-oss/notifications/mailer) over `wrapsMailer` (@byo-oss/mailer/wraps), built by
`authMailer` (`packages/auth/src/mailer.ts`). `NOTIFICATION_EMAIL_ROUTES` in
`packages/auth/src/notifications.ts` holds the rules.

- **Security notices go out at once, even if read first.** The email is the record, and it reaches
  the owner when someone else is in the account.
- **The rest wait 15 minutes** and are dropped if the notification was read or seen in the app.
  An unread row in the open bell is marked seen (`mark-seen`) once at least half of it has been on
  screen for a second in a visible tab; rows below the scroll aren't. Seen doesn't change the
  badge. A person who isn't in the app gets the email at once. "In the app" means their bell polled
  the unread count in the last 2 minutes; an impersonated session doesn't count.
- **A throttle caps events that can repeat**: one email per person per window, the rest stay in-app.
- **Sending**: each routed notification gets a `notification_delivery` row. The API process sends
  the due ones with `sweepAll` from `@byo-oss/core` every `SUPPORT_SWEEP_INTERVAL_MS` (60 s;
  `apps/api/src/support-sweep.ts`, which runs every BYO plugin's sweep, notifications' included).
  Every replica can run the sweep: each delivery is claimed before it is sent. A failed send retries with backoff
  and gives up after 5 attempts (`status: "failed"`, the error in `detail`). An SDK validation error
  (a malformed recipient or sender address) and an SES `MessageRejected` or `InvalidParameterValue`
  fail the delivery at once, except an unverified identity (the sender, or a recipient while the
  account is in the SES sandbox), which retries like throttling and network errors. A non-ASCII
  sender display name is sent RFC 2047 encoded. Delivery is at-least-once: a crash after SES
  accepted an email can send it again.
- **Adding an email:** add the type to `NOTIFICATION_EMAIL_ROUTES` and fill in its **email** cell
  below; `notifications.test.ts` checks the two agree. Leave out events another email already
  covers: `invitation.received` (the invitation email) and `account.email_changed` (the old address
  was told when the change was requested).

## Rules

- **A send never fails its request.** `send` catches every error and reports it. In the API that
  goes to `reportError`; in auth it goes to `onNotificationError`.
- **Sends wait for the transaction to commit** (`queueAfterTransactionHook`). They are dropped on
  rollback. `auth.api.notify` called directly inside a better-auth transaction joins it
  (@byo-oss/notifications 0.9), but its errors would fail the transaction, so go through `send`.
- **Recipients come from the permission catalog, not role names.** Approvers are the roles with
  `run: ["approve"]`. Member managers have `member: ["update"]`, key managers
  `apiKey: ["create", "delete"]`, billing managers `subscription: ["update"]`. If the catalog
  changes, the recipients follow.
- **The person who caused an event is not told about it.**
- **Fan-out is one insert per recipient, awaited by the request.** @byo-oss/notifications refuses an org with
  more than `maxFanout` members (1000 by default). Above that, every org-wide event is reported and
  nobody gets it. Raise `inbox({ maxFanout })` or queue the sends before you get there.
  `approval.requested` reaches every approver, and `member` approves. To narrow it, change
  `APPROVERS` in the catalog, not the emitter.
- **Org rows go when the access goes.** The inbox plugin does this itself (0.8): removing a member,
  or the member leaving, deletes that user's rows for the organization, and deleting an organization
  deletes its rows (backed by the foreign key in migration 0010). The removal notice is personal, not
  stamped with the organization, so it survives. SCIM deprovisioning is outside those endpoints: it
  removes the membership inside the directory's transaction, so `endAccessIn` (`packages/auth/src/index.ts`)
  calls `deleteMemberData` there, and the rows commit or roll back with the membership. That needs
  @byo-oss/notifications 0.9: earlier cleanup used the outer adapter and hangs on PGlite inside the
  transaction. The tests are in `apps/api/src/auth-flows.test.ts` (over HTTP) and
  `packages/auth/src/notifications.test.ts` (commit and rollback).
- **Adding an event:** add it to `NotificationEvent`, `renderNotification` and `recipientsOf`, then
  add it to the table below. The test in `packages/auth/src/notifications.test.ts` checks that
  every catalog type is listed here. Add a line to GLOSSARY.md only for a new concept, not for a
  new event.

## Events

| type | sent when | to | organization | email |
|---|---|---|---|---|
| `approval.requested` | `request_approval` | approvers, minus the requester | yes | after 15 min unread, 1/h |
| `approval.decided` | `decide_approval`, at decision time; the copy says the decision can be undone for 30 s | the run's starter if a person, unless they decided | yes | no |
| `run.done` | `update_run` moves a run to done (once) | the run's starter if a person | yes | no |
| `run.failed` | `update_run` moves a run to failed (once) | the run's starter if a person, else member managers | yes | after 15 min unread, 1/h |
| `member.joined` | an invitation is accepted, or a member is added | member managers, minus the new member and the actor | yes | no |
| `member.role_changed` | `/organization/update-member-role` | the member, unless they changed it themselves | yes | no |
| `invitation.received` | an invitation is created for an address that already has an account | the invited person | no | no |
| `member.removed` | a member is removed (not on leaving) | the removed person | no | no |
| `api_key.created` | `/api-key/create`, which includes `create_api_key`; provisional keys are skipped | key managers, minus the actor | yes | at once |
| `api_key.revoked` | `/api-key/delete` | key managers, minus the actor | yes | no |
| `agent_access.revoked` | `revoke_agent_access` | key managers, minus the actor | yes | no |
| `security.two_factor_reset` | `reset_member_two_factor` | the member | yes | at once |
| `billing.payment_failed` | Stripe `invoice.payment_failed` | billing managers | yes | after 15 min unread, 1/day |
| `billing.subscription_canceled` | Stripe `customer.subscription.deleted` | billing managers | yes | no |
| `usage.limit_reached` | the first call refused by the daily meter, once per organization per UTC day (a marker row in `usage_daily`) | billing managers | yes | after 15 min unread |
| `account.password_changed` | `/change-password` or a password reset | the user | no | at once |
| `account.two_factor_enabled` | two-factor turned on | the user | no | no |
| `account.two_factor_disabled` | two-factor turned off | the user | no | at once |
| `account.passkey_added` | `/passkey/verify-registration` | the user | no | at once |
| `account.email_changed` | a change-email link is verified | the user | no | no |
| `support.ticket.created` | a customer opens a support ticket (in the app or by mail) | support staff (the operator organization's roles with `support: ["read"]`), minus the requester | the operator organization | no |
| `support.customer.replied` | a customer replies to a ticket | support staff, minus the customer | the operator organization | no |
| `support.agent.mentioned` | an agent @mentions another agent | the agent mentioned, unless they mentioned themselves | the operator organization | no |
| `support.agent.replied` | an agent replies (not an internal note) | the ticket's requester, unless they replied themselves; nobody for an email-only requester | no | no |

Support events come from `@byo-oss/support`'s `onEvent` (`packages/auth/src/support.ts`), which
routes four of them through this catalog. The rest send nothing; `support.note.added` (an internal
note) must never reach a customer. Nothing fans out to a ticket's own organization: a private
ticket's events carry its organization too, so such a fan-out must skip `visibility: "private"`. None of
them is in `NOTIFICATION_EMAIL_ROUTES`: support mails its own thread replies (`docs/support.md`).
