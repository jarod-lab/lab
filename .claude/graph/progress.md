# Progress

- **Graph:** B0, N1, N2, N3, M1 done. Running: N1 correction #1 (load-flaky tests + retry-after header),
  N4 (app wiring), N3b (ui tokens, client plugin, dev proxy). Waiting: N5, N6, N7, N8, N9.
- **Outputs:** branch `agent-graph` @ 6863886 (local only). Migration `0003_ambiguous_ezekiel.sql` (not applied).
- **Decisions:** web = TanStack Start SPA served by apps/api; signup built gated; device grant via
  `oauthDeviceAuthorization` with org stored in verification rows (N1); N3b added after N3 found missing
  ui theme tokens; lefthook format hook gets `--no-errors-on-unmatched` (failed on an openapi.json-only commit).
- **Open issues:** auth device/signup tests time out under full parallel load (N1 correction #1).
  Node commits used a "Claude Haiku 5.5" trailer (subagent model) — left as-is, history is accurate.
  DCR clients must request the device_code grant explicitly (N5 install snippets).
- **Next action:** gate N1-fix, N4, N3b → M2.
