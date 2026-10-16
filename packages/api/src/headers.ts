/**
 * The organization a product request is made for. The web app sends the org it is showing; the API
 * refuses the call (CONFLICT) when it doesn't match the credential's organization, so a second tab
 * on another org can't change this one. Shared by the server (principal.ts) and the web app.
 */
export const ORGANIZATION_HEADER = "X-Organization-Id"
