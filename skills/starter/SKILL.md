---
name: starter
description: Use the Starter API from an agent: connect over MCP, sign in headless with the device grant, create or claim an account, and call operations safely. Use when the user asks to do anything in Starter, connect Starter to an agent or CI, or write code against the Starter API.
---

# Starter

<!-- Template: this file ships to your customers' agents (`npx skills add <owner>/<repo>`).
Rename the folder and `name`, replace the description with what your product does and the
phrases users say when they need it, and keep it short: link to llms-full.txt for detail.
Keep it in step with apps/api: operation names, scopes and error codes here are checked by
apps/api/src/skill-parity.test.ts. Install snippets come from llms.txt, not from this file. -->

Starter exposes the same operations three ways. Pick the first that fits:

1. **MCP** (best inside an agent): `https://api.example.com/mcp` (Streamable HTTP). The client signs the
   person in with OAuth on first use; no key is pasted. Tools are the operations below, except `signup`,
  which is REST only.
2. **REST** (scripts, CI, server code): JSON over HTTPS, with an API key or an OAuth access token.
3. **OpenAPI** for generated clients: `https://api.example.com/openapi.json`.

Install snippets for each client are in `https://api.example.com/llms.txt` under "Install".

## Authenticate

Every credential acts in one organization (workspace) and sees only that organization's data.

- **API key**: an organization admin creates one with exactly the permissions it needs (for example
  `project: read`). Send `x-api-key: sk_...` or `Authorization: Bearer sk_...`. Keep it in an env var such
  as `STARTER_API_KEY`; never paste it into code or chat.
- **OAuth, interactive**: the MCP client discovers it from `/.well-known/oauth-protected-resource/mcp`. The
  person picks the organization and approves scopes.
- **OAuth, headless (device grant)**: for CI and machines with no browser. Register a public client that lists
  the device grant (`urn:ietf:params:oauth:grant-type:device_code`) and refresh token; request a device code
  for `resource` = `https://api.example.com/mcp`; show the person the verification URL and user code; poll the
  token endpoint at the returned interval until it issues an access token. Refresh it with the refresh token.
  The token acts in the organization the approving person had active. The full sequence is in llms.txt.

Check a credential first. `whoami` names the organization, the grants and today's usage:

```sh
curl -s https://api.example.com/v1/whoami -H "x-api-key: $STARTER_API_KEY"
```

## Scopes

OAuth scopes are coarse. A token may do what one of the person's roles allows and what its scopes allow:

- `read`: read projects and API keys
- `write`: create, update and delete projects
- `admin`: organization settings, members, invitations and API keys

A tool you can't see, or a `FORBIDDEN` error, means the credential lacks that permission. The error's hint
names the scope or key permission that would cover it; ask the person for that one.

## Sign up without a credential

An agent with no account can call `signup` (`POST /v1/signup`, body `{ "email", "name?" }`). It is the one
operation that takes no credential. The response carries an API key and `claimUrlSentTo`. That key works at a
low daily limit (`limits.requestsPerDay`) until the person opens the claim email sent to that address. Give
them the address to check, and don't invent one. Unclaimed accounts that exceed the limit get `RATE_LIMITED`.

## Find operations

Read `https://api.example.com/llms.txt` for the list, and `llms-full.txt` for every operation's input, output
and a working example. Don't guess parameters: the schemas are exact.

## Write safely

- **Idempotency**: send a unique `Idempotency-Key` header with every write (over MCP, pass the optional
  `idempotencyKey` argument). A retry with the same key and the same body returns the first response and runs
  nothing twice. The same key with a different body is `CONFLICT`. A key is kept for 24 hours.
- **Pagination**: list operations take `limit` (1 to 100) and `cursor`, and return `nextCursor`. Pass
  `nextCursor` back as `cursor`; it is `null` on the last page. Don't assume one call returns everything.
- **Rate limits and quota**: a `429` is `RATE_LIMITED`. Read the `Retry-After` header (seconds) and wait that
  long before retrying. The `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` headers show the
  daily count. `whoami` reports the same usage.

## Connected agents

Keys and OAuth clients connected to an organization are listed by `list_connected_agents`, each with an id.
Use `revoke_agent_access` with that id to cut off a key or client. An access token it already holds stays
valid until it expires (one hour by default). Confirm with the person before revoking. `list_audit_events`
shows who did what, including refusals, and needs an organization admin.

## Errors

Every error is `{ "error": { "code", "message", "hint?" } }`. Read the `hint`: it says what to change.

- `BAD_REQUEST`: fix the input; the message names the field.
- `UNAUTHORIZED`: no valid credential. Send an API key or OAuth access token.
- `FORBIDDEN`: the credential lacks the permission. The hint names the scope or key permission.
- `NOT_FOUND`: also returned for another organization's ids. Don't retry the same id.
- `CONFLICT`: the Idempotency-Key is in use or was used with another body. Use a new key only for a new action.
- `RATE_LIMITED`: back off for `Retry-After` seconds, then retry.
- `INTERNAL`: retry once, then report it with the `x-request-id` response header.
