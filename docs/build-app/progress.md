# Progress

- **Graph:** every node done. N0, E0, N4, N1, N5+P1, N2, P2, P4, N3, A1, P3+P4b, P7, P5+P6, S1, P8+P8b+P7b, P9,
  P10+P10b, P11+P11b, P12, Z, security review → S2, B1 (billing roles), E1 (all e2e + visual), S3 (web origins),
  F1 (forms on TanStack Form), final visual review of all 56 screenshots.
- **Outputs:** see checks.md (every requirement with evidence); notes folded into AGENTS.md.
- **Decisions:** D1 board URLs; D2 no bearer plugin; N5+P1 merged; dev mail sink; D5 account auth before
  P5/P6; P4 before P3; admins manage billing (boards); impersonation read-only and fail-closed; WEB_ORIGINS for
  split-origin dev.
- **Packages (prompt step 1):** TanStack has no markdown or code-highlighting package: the run summary uses
  `react-markdown` (no raw HTML) and `sugar-high` (tokens rendered as React spans). `@tanstack/react-charts` was
  installed, then removed unused: no board or API has time-series data (the footprint and usage are single
  values shown with `Meter`/`Progress`). Router, Query, Form, Table, Virtual, Pacer, Hotkeys and Devtools are used.
- **Open issues (accepted, documented):** passkeys untestable in e2e (no WebAuthn); no passkey-first sign-up;
  no change-email cancel; SCIM users not projected into the org, SCIM tokens not listable/revocable (end on
  owner removal/leave only); admins can read SSO provider config; social/SSO sign-ins skip TOTP; SSO domain
  verification success path needs real DNS; guardrails view is [PLACEHOLDER] (no API); autonomy is per agent;
  invitation shows inviter email not name; billing is fixture data until Stripe test keys + plans are set.
- **Local state:** Postgres container `starter-db-1` running with migrations 0000–0009; local admin
  `admin@example.test` exists in it (throwaway).
- **`pnpm dev`** (portless): fixed after the run (both apps claimed one name; portless's turbo mode re-ran
  the root `portless`; vite ignored portless's PORT). Now `app.starter.localhost` and `api.starter.localhost`;
  it needs `WEB_ORIGINS=https://app.starter.localhost` in `.env`. The passkey rpID `starter.localhost` is untested.
- **Next action:** none in the graph. Optional: CI job for e2e; push/PR (not done: the user didn't ask).
