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
- The e2e job in CI (see `docs/tooling.md`) and `llms.txt` on a marketing domain (there is no
  marketing app here).
