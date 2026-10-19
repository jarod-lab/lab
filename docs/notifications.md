# Notifications

In-app notifications come from [better-inbox](https://github.com/better-inbox/better-inbox), a
better-auth plugin. A **notification** (GLOSSARY) is a row in the `notification` table addressed to
one user. A row that is about an organization is stamped with that organization's id. The top bar's
bell lists a person's notifications. It is separate from the **Inbox**, which is the count of runs
that need you.

## Pieces

- `packages/auth/src/index.ts` mounts `inbox()`. `packages/auth/src/client.ts` adds
  `inboxClient()`. The routes are `GET /api/auth/inbox/list`, `GET /api/auth/inbox/unread-count`,
  `POST /api/auth/inbox/mark-read` and `POST /api/auth/inbox/mark-all-read`. They are session-only
  and scoped to the caller. An impersonated session can list but not mark read (`guards.ts`).
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
  `apps/app/src/containers/notifications.tsx` wires it to better-inbox's `useInbox`. It polls the
  unread count every 30 s, paused while the tab is hidden, and refreshes the list whenever the
  bell opens.

## Rules

- **A send never fails its request.** `send` catches every error and reports it. In the API that
  goes to `reportError`; in auth it goes to `onNotificationError`.
- **Sends wait for the transaction to commit** (`queueAfterTransactionHook`). They are dropped on
  rollback. Calling `auth.api.notify` inside a better-auth transaction hangs on PGlite, which has a
  single connection.
- **Recipients come from the permission catalog, not role names.** Approvers are the roles with
  `run: ["approve"]`. Member managers have `member: ["update"]`, key managers
  `apiKey: ["create", "delete"]`, billing managers `subscription: ["update"]`. If the catalog
  changes, the recipients follow.
- **The person who caused an event is not told about it.**
- **Fan-out is one insert per recipient, awaited by the request.** better-inbox refuses an org with
  more than `maxFanout` members (1000 by default). Above that, every org-wide event is reported and
  nobody gets it. Raise `inbox({ maxFanout })` or queue the sends before you get there.
  `approval.requested` reaches every approver, and `member` approves. To narrow it, change
  `APPROVERS` in the catalog, not the emitter.
- **Org rows go when the access goes.** Removing a member, or the member leaving, deletes that
  user's rows for the organization. Deleting an organization cascades its rows (a foreign key in
  migration 0010).
- **Adding an event:** add it to `NotificationEvent`, `renderNotification` and `recipientsOf`, then
  add it to the table below. The test in `packages/auth/src/notifications.test.ts` checks that
  every catalog type is listed here. Add a line to GLOSSARY.md only for a new concept, not for a
  new event.

## Events

| type | sent when | to | organization |
|---|---|---|---|
| `approval.requested` | `request_approval` | approvers, minus the requester | yes |
| `approval.decided` | `decide_approval`, at decision time; the copy says the decision can be undone for 30 s | the run's starter if a person, unless they decided | yes |
| `run.done` | `update_run` moves a run to done (once) | the run's starter if a person | yes |
| `run.failed` | `update_run` moves a run to failed (once) | the run's starter if a person, else member managers | yes |
| `member.joined` | an invitation is accepted, or a member is added | member managers, minus the new member and the actor | yes |
| `member.role_changed` | `/organization/update-member-role` | the member, unless they changed it themselves | yes |
| `invitation.received` | an invitation is created for an address that already has an account | the invited person | no |
| `member.removed` | a member is removed (not on leaving) | the removed person | no |
| `api_key.created` | `/api-key/create`, which includes `create_api_key`; provisional keys are skipped | key managers, minus the actor | yes |
| `api_key.revoked` | `/api-key/delete` | key managers, minus the actor | yes |
| `agent_access.revoked` | `revoke_agent_access` | key managers, minus the actor | yes |
| `security.two_factor_reset` | `reset_member_two_factor` | the member | yes |
| `billing.payment_failed` | Stripe `invoice.payment_failed` | billing managers | yes |
| `billing.subscription_canceled` | Stripe `customer.subscription.deleted` | billing managers | yes |
| `usage.limit_reached` | the first call refused by the daily meter, once per organization per UTC day (a marker row in `usage_daily`) | billing managers | yes |
| `account.password_changed` | `/change-password` or a password reset | the user | no |
| `account.two_factor_enabled` | two-factor turned on | the user | no |
| `account.two_factor_disabled` | two-factor turned off | the user | no |
| `account.passkey_added` | `/passkey/verify-registration` | the user | no |
| `account.email_changed` | a change-email link is verified | the user | no |
