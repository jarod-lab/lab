# Progress

- **Graph:** waves 1–3 merged (M3 green @ 019a7a8). Running wave 4: N8 (journeys A/B/C), N9 (docs).
  Waiting: M4 + final advisor review.
- **Outputs:** branch `agent-graph` @ 019a7a8 (local only). Migration `0003_ambiguous_ezekiel.sql` (not applied).
- **Decisions:** web = TanStack Start SPA served by apps/api; signup built gated; device grant via
  `oauthDeviceAuthorization` with org stored in verification rows (N1); N3b added after N3 found missing
  ui theme tokens; lefthook format hook gets `--no-errors-on-unmatched` (failed on an openapi.json-only commit).
- **Open issues:** auth device/signup tests time out under full parallel load (N1 correction #1).
  Node commits used a "Claude Haiku 5.5" trailer (subagent model) — left as-is, history is accurate.
  DCR clients must request the device_code grant explicitly (N5 install snippets).
- **Next action:** gate N8, N9 → M4 (merge, full chain) → advisor on full diff → delivery.
