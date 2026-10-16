# Progress

- **Graph:** complete. B0, N1 (+fix), N2, N3 (+N3b, N3c), N4, N4b, N5, N6, N7, N8, N9, M1–M4, review fixes.
  Nothing running, nothing blocked inside scope.
- **Outputs:** local branch `agent-graph` (not pushed), 53a0710..HEAD. Migration
  `packages/db/drizzle/0003_agent_distribution.sql` (generated, NOT applied).
- **Decisions:** see graph.md "Design decisions" and "Lead edits outside nodes". Headless login is the
  oauth-provider device grant; web is TanStack Start SPA served by apps/api; signup returns an `sk_` key.
- **Open issues (unresolved rows in checks.md):**
  - CI jobs (oasdiff, docker) not yet run on GitHub; compose stack not run end to end (needs a DB).
  - Cursor remote config and VS Code `--add-mcp` `type:"http"` snippet shapes inferred, not verified.
  - OAuth grant check is 3 point lookups per request (composite index + db accessor = follow-up).
  - No cleanup job for signup_attempt, device-org verification rows, expired idempotency keys.
  - FORBIDDEN/BAD_REQUEST attempts are not audited.
  - `list_projects` now returns at most 50 per page by default (silent behaviour change).
  - GET / from a browser goes to /llms.txt (agent negotiation), not /sign-in.
  - Real-browser OAuth round trip with an actual MCP client (Claude Code/Cursor) not exercised.
- **Next action (user):** review, apply 0003, push + PR, publishing steps.
