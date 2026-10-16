# Progress

- **Graph:** Done: lead install (89237c7), N0 (6ae77ca), E0 (4d97424), N4 (a20d13a), N1 (263dab3).
  Running: N2 (sso/scim/stripe + magic-link-2FA correction + device-approve test + dev mail sink),
  N5+P1 merged (data layer, app shell, org switcher, /new, hotkeys, static PAGE_PATHS). Blocked: —.
- **Outputs:** see checks.md; notes for AGENTS.md accumulate in `docs/build-app/agents-notes.md`.
- **Decisions:** D1 board URLs. N5 and P1 merged into one node (the shell is P1's page). Dev mail sink
  (`DEV_MAIL_SINK`, `GET /api/dev/mail`) added to N2 because e2e has no inbox. Product calls send
  `X-Organization-Id`; N3 enforces the mismatch check server-side.
- **Open issues:** magic link bypassed 2FA (correction sent to N2). Passkey sign-in untestable over HTTP and
  in e2e (no virtual authenticator). User must apply migrations 0003+ and start Postgres before E1.
- **Next action:** gate N2 and N5+P1; then N3 (agent runs API), then P2.
