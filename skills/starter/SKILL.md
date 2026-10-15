---
name: starter
description: Use the Starter API from an agent: authenticate, discover operations, and call them over MCP or REST. Use when the user asks to do anything in Starter, connect Starter to an agent, or write code against the Starter API.
---

# Starter

<!-- Template: this file ships to your customers' agents (`npx skills add <owner>/<repo>`).
Rename the folder and `name`, replace the description with what your product does and the
phrases users say when they need it, and keep it short: link to llms-full.txt for detail.
Keep it in step with apps/api: operations, scopes and error codes here must match openapi.json. -->

Starter exposes the same operations three ways. Pick the first one that fits:

1. **MCP** (best inside an agent): `https://api.example.com/mcp` (Streamable HTTP). The client signs
   the user in with OAuth on first use; no key needed. Tools are the operations below.
2. **REST** (scripts, CI, server code): JSON over HTTPS with an API key.
3. **OpenAPI** for generated clients: `https://api.example.com/openapi.json`.

## Authenticate

Every credential acts in one organization (workspace) and can only see that organization's data.

- API key: an organization admin creates one with exactly the permissions it needs (e.g. `project:read`), then
  send `x-api-key: sk_...` (or `Authorization: Bearer sk_...`). Keep it in an env var such as `STARTER_API_KEY`;
  never paste it into code or chat.
- OAuth: MCP clients discover it from `/.well-known/oauth-protected-resource/mcp`. The user picks the organization
  and grants scopes: `read`, `write` (projects), `admin` (members, invitations, API keys). The agent gets the
  user's role in that organization, narrowed to those scopes.
- A tool you can't see, or a `FORBIDDEN` error, means the credential lacks a permission. `whoami` shows the
  organization and the credential's grants; ask the user for a key or scope that covers what you need.

Check a credential first:

```sh
curl -s https://api.example.com/v1/whoami -H "x-api-key: $STARTER_API_KEY"
```

## Find operations

Read `https://api.example.com/llms.txt` for the list, and `llms-full.txt` for every operation's input,
output and a working example. Don't guess parameters: the schemas are exact.

## Errors

Every error is `{ "error": { "code", "message" } }`. Codes: `BAD_REQUEST` (fix the input; the message says
which field), `UNAUTHORIZED`, `FORBIDDEN` (missing scope), `NOT_FOUND` (also for another organization's ids), `CONFLICT`, `RATE_LIMITED`
(back off, then retry), `INTERNAL` (retry once, then report it with the `x-request-id` response header).
