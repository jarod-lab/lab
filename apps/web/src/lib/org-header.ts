/**
 * The organization a product API call is made for. The page sends the org it is showing, so the
 * server can refuse a call that doesn't match the session's organization (a second tab on another
 * org must not change this one). N3 implements the server check; the web app only sends it.
 */
export const X_ORGANIZATION_ID = "X-Organization-Id"

export function organizationHeaders(organizationId: string): Record<string, string> {
  return { [X_ORGANIZATION_ID]: organizationId }
}
