# Not yet

- Custom roles per org (`dynamicAccessControl`: resolve roles from the DB in `rolePermissions`, then
  rerun the parity test).
- Live Stripe: the plugin runs in test mode with env plans. The Billing page shows fixture data
  until it's configured.
- SCIM provisioning into the org, and listing or revoking SCIM tokens. Admins can still read SSO
  provider config.
- Passkey sign-up without an existing session, and e2e for passkeys (the e2e browser has no
  WebAuthn).
- Publishing: the MCP registry, the Claude connectors directory, Smithery, and `npx skills add` for
  `skills/starter`. Each needs your namespace and a real URL.
- Deploy target: the Dockerfile and `scripts/release.mjs` only. No platform config.
- LLM onboarding eval: an agent starting from `llms.txt` alone, judged on its run. The deterministic
  HTTP journeys exist (`apps/api/src/onboarding.test.ts`: device grant from discovery, self-signup
  and claim, CLI login).
- Composite index for the grant check (the three lookups in `grantStands`).
- Cleanup job for `signup_attempt`, for expired `idempotency_key` rows (reserve reclaims only the
  key it reserves), and for `device-org:` rows in `verification`.
- Audit for FORBIDDEN and BAD_REQUEST attempts.
- Verifying the Cursor and VS Code install snippets. Their shapes are inferred from docs.
- The e2e job in CI (see `docs/tooling.md`) and `llms.txt` on a marketing domain (there is no
  marketing app here).
