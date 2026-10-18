# Auth plugins

All `@better-auth/*` packages are at the pinned version (`better-auth` and `@better-auth/*` are
exact pins; see `docs/tooling.md`). Flows are tested in `apps/api/src/auth-flows.test.ts`.

The Wraps plugin does contact sync and sends the SES auth emails. Organizations are on: signup
creates a personal org. Org-owned API keys (`sk_`) and the OAuth 2.1 and jwt plugins are in
`packages/auth`, which also has `packages/auth/src/access.ts` (the permission catalog),
`packages/auth/src/permissions.ts` (grant math and OAuth scope grants), `resolvePrincipal`
(`packages/auth/src/principal.ts`), `packages/auth/src/device.ts` (the device grant) and
`packages/auth/src/signup.ts` (provisional signup).

## Sign-in methods

- Password, magic link (Wraps SES), passkey (rpID = the base URL host, or the shared parent of it
  and `WEB_ORIGINS`; see `passkeyRpID`), GitHub and Google (only when both env values are set), and
  SSO (`@better-auth/sso`; domain verification is required before a provider signs anyone in).
- `GET /api/auth/sign-in-methods` tells the web app which are on. `lastLoginMethod` drives the "Last
  used" badge. Sessions record `loginMethod` and `loginTwoFactor`.
- No `bearer` plugin: session tokens must not pass as API credentials.

## Two-factor

- TOTP, backup codes and trusted devices. The challenge goes to `/two-factor` and keeps the query,
  so OAuth resumes.
- A magic link for a 2FA user opens the challenge, not a session.
- Social and SSO sign-ins don't ask for TOTP (the provider's MFA applies).
- Owners reset a member's 2FA with `reset_member_two_factor`. It is refused with CONFLICT while the
  member belongs to any other shared organization, because the 2FA belongs to the account.

## Passwords

`haveIBeenPwned` is on (`PASSWORD_COMPROMISED`). Tests stub fetch to `api.pwnedpasswords.com`.

## Account

- Email change: a link to the new address and a notice to the old one. There is no native cancel.
  The link needs the user's own session. Opened signed out, it sends them to sign-in and changes
  nothing.
- Deletion needs an emailed confirmation. It is refused (`OWNS_ORGANIZATION`) while the user owns a
  shared organization.
- Account linking with `LAST_SIGN_IN_METHOD` protects the last way in
  (`packages/auth/src/account-plugin.ts`).
- `GET /api/auth/security/summary` (`packages/auth/src/security-summary.ts`).

## OAuth resume

Every step that resumes an authorization carries `oauth_query`. The magic link callbackURL holds it
(`packages/auth/src/resume.ts`).

## admin

- `adminRoles: ["admin"]`. Admins are promoted in the database only
  (`update "user" set role='admin' …`).
- Impersonation is read-only and fails closed (`packages/auth/src/guards.ts`). An impersonated
  session gets 403 `IMPERSONATED_SESSION_NOT_ALLOWED` for every better-auth request except
  stop-impersonating and sign-out. A GET passes only if it is listed as a read; each GET the plugins
  mount is classified in `packages/auth/src/guards.test.ts`.
- The product API gives it read-only grants (`IMPERSONATION_GRANTS`).

## sso, scim, stripe

- Owner-only resources: `sso` and `scim`. `subscription` is for owners and admins. All three are in
  `OAUTH_EXCLUDED` (`packages/auth/src/owner-only.ts`, `packages/auth/src/scim-token.ts`).
- SCIM users aren't projected into the org yet. Tokens can't be listed or revoked.
- A SCIM token ends when its creator is removed or leaves the org
  (`packages/auth/src/scim-token.ts`). Demoting the creator or deleting their account doesn't end it
  yet.
- Stripe is test mode only (`sk_test_`). It is mounted with `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET`, plans come from `STRIPE_PLANS`, and the plugin goes last.
- scim needs `drizzleAdapter(..., { transaction: true })`, so its hooks use `getCurrentAdapter`
  (PGlite deadlocks otherwise).

## Dev mail sink

`DEV_MAIL_SINK=true` (refused unless `NODE_ENV` is development or test) keeps auth emails in memory
instead of sending them through SES. `GET /api/dev/mail?to=` returns them, and the e2e tests read
their links there.

## Exports from `@starter/auth`

- `revokeGrants(db, scope, now)` (`packages/auth/src/member-grants.ts`) ends a grant: it deletes the
  consent, and revokes the refresh and access tokens. `revokeMemberGrants` is the member-scoped form
  used when someone is removed or leaves.
- `memberGrants` (`packages/auth/src/membership.ts`) gives a member's grants in an org.
- `personalSlug(userId)` (`packages/auth/src/membership.ts`) builds a personal organization's slug.
  It is used by `apps/api/src/data/members.ts`.
- `PERSON_ONLY_ACTIONS` (`packages/auth/src/access.ts`) lists the actions no API key may hold:
  `run: ["approve"]`. `PERSON_ONLY_RESOURCES` is the owner-only resources plus `subscription`.
- `provisionalSignup` (`packages/auth/src/signup.ts`) reads the database from `auth.db`. It has no
  WeakMap registry.
- JWKS are cached for 60 seconds per auth instance (`JWKS_TTL_MS` in
  `packages/auth/src/principal.ts`).

## Generated files

`packages/db/src/auth-schema.ts` and the drizzle meta come out unformatted. Run `pnpm format` after
generating them.

## Entry points

- `createAuth({ db, secret, baseURL, emailFrom })` (`packages/auth/src/index.ts`) builds the auth
  instance. `auth.db` is its database.
- `createClient()` (`packages/auth/src/client.ts`) is the browser client. It imports only
  `packages/auth/src/access.ts` from the package, so it must not import server modules.
