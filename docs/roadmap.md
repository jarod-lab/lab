# Not yet

- Custom roles per org (`dynamicAccessControl`: resolve roles from the DB in `rolePermissions`, then
  rerun the parity test). The fixed capability roles (`approver`, `operator`, `billing`) cover the
  common gaps meanwhile; built-in roles must stay free of extra queries.
- Live Stripe: the plugin runs in test mode with env plans. The Billing page shows fixture data
  until it's configured.
- Admins can still read SSO provider config.
- E2e for passkeys (the e2e browser has no WebAuthn).
- Publishing: the MCP registry, the Claude connectors directory, Smithery, and `npx skills add` for
  `skills/starter`. Each needs your namespace and a real URL.
- Deploy target: the Dockerfile and `scripts/release.mjs` only. No platform config.
- LLM onboarding eval: an agent starting from `llms.txt` alone, judged on its run. The deterministic
  HTTP journeys exist (`apps/api/src/onboarding.test.ts`: device grant from discovery, self-signup
  and claim, CLI login).
- Drop the single-column `clientId` indexes on `oauth_consent` and `oauth_refresh_token`, now covered
  by the 0011 composite indexes.
- Audit for FORBIDDEN and BAD_REQUEST attempts.
- Notifications for agents: an operation (`list_notifications`) so an OAuth client acting for a
  person can read their notifications. Email or push delivery, per-person preferences and digests.
  Today they are in-app only (`docs/notifications.md`).
- Verifying the Cursor and VS Code install snippets. Their shapes are inferred from docs.
- `llms.txt` on a marketing domain (there is no marketing app here).
- Uploads: a deleted organization's or person's files stay in the file store (their keys start
  `org/<id>/` and `user/<id>/`, so a sweep can find them). Presigned direct-to-bucket uploads for
  files bigger than an avatar. Resizing on upload. R2 buckets in an EU or US jurisdiction (an
  `R2_JURISDICTION` for the `<account>.eu.` endpoint), and Vercel Blob through OIDC alone (no
  read-write token). (`docs/storage.md`)
- Feature flags (`docs/feature-flags.md`): multi-variant flags and experiments (string and number
  values, sticky assignment, metrics per variant); targeting by attribute (plan, region) beyond
  organizations; metering OFREP calls; counting MCP tool failures and browser errors against the
  flag values they saw (today only REST 5xx are); clearing other API instances' rollout cache on a
  write (today they catch up within 5 seconds); a rollout history (the audit trail has who did what).
- Analytics (`docs/analytics.md`): signed-out page views (needs an anonymous id and consent),
  organization group properties, UI events beyond page views, per-person opt-out, a per-session rate
  limit on `POST /api/events`, and leaving impersonated sessions out of a person's events.
