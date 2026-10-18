import { z } from "zod"

import { type AnyOperation, formatPermissions, pathParams } from "./operation"
import { isEmpty, type PermissionSet } from "./permissions"

export interface ApiInfo {
  title: string
  version: string
  description: string
  /** Public base URL, e.g. https://api.example.com */
  baseURL: string
  /** OAuth endpoints, when the API accepts OAuth access tokens. */
  oauth?: {
    authorizationUrl: string
    tokenUrl: string
    scopes: Record<string, string>
    /** OAuth scopes that would allow these permissions; any one of them suffices. */
    scopesFor: (permissions: PermissionSet) => string[]
  }
}

type JsonSchema = Record<string, unknown> & {
  properties?: Record<string, object>
  required?: string[]
}

const ERROR_SCHEMA = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        hint: { type: "string", description: "What the caller can do to fix this." },
        docs: { type: "string", description: "A link with more detail." },
      },
    },
  },
}

/** Sent with every non-readOnly operation: a client-chosen key that makes retries safe. */
const IDEMPOTENCY_KEY_PARAM = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description:
    "Unique key for this request. Retrying with the same key and body returns the first response; " +
    "reusing it with a different body is a CONFLICT.",
  schema: { type: "string", minLength: 1, maxLength: 255 },
}

const RATE_LIMITED_RESPONSE = {
  description: "Rate limited or over quota. Wait for the Retry-After header before retrying.",
  headers: {
    "Retry-After": {
      description: "Seconds to wait before retrying.",
      schema: { type: "integer", minimum: 0 },
    },
  },
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
}

export const inputSchema = (op: AnyOperation): JsonSchema =>
  z.toJSONSchema(op.input, { io: "input", unrepresentable: "any" }) as JsonSchema

export const outputSchema = (op: AnyOperation): JsonSchema =>
  z.toJSONSchema(op.output, { io: "output", unrepresentable: "any" }) as JsonSchema

/** `/v1/notes/:id` -> `/v1/notes/{id}` */
export const openApiPath = (path: string) => path.replace(/:([A-Za-z0-9_]+)/g, "{$1}")

function operationObject(op: AnyOperation, oauth: ApiInfo["oauth"]) {
  const schema = inputSchema(op)
  const props = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  const inPath = new Set(pathParams(op.path))
  const hasBody = op.method !== "GET" && op.method !== "DELETE"
  // A public operation runs no hooks, so it takes no Idempotency-Key either.
  const isPublic = op.auth === "none"
  const parameters = [
    ...Object.entries(props)
      .filter(([key]) => inPath.has(key) || !hasBody)
      .map(([key, s]) => ({
        name: key,
        in: inPath.has(key) ? "path" : "query",
        required: inPath.has(key) || required.has(key),
        schema: s,
      })),
    ...(op.hints?.readOnly || isPublic ? [] : [IDEMPOTENCY_KEY_PARAM]),
  ]
  const bodyProps = Object.fromEntries(Object.entries(props).filter(([k]) => !inPath.has(k)))
  // An operation whose input is all path parameters reads no body, so it declares none.
  const takesBody = hasBody && Object.keys(bodyProps).length > 0
  const example = op.examples?.[0]
  const bodyExample =
    example &&
    Object.fromEntries(
      Object.entries(example.input as Record<string, unknown>).filter(([k]) => !inPath.has(k)),
    )
  const responseContent = { "application/json": { schema: outputSchema(op) } }
  return {
    operationId: op.name,
    summary: op.summary,
    description: op.description,
    // A body operation always lists its parameters, even none (the committed contract's public
    // signup has always carried `parameters: []`).
    ...((parameters.length > 0 || takesBody) && { parameters }),
    ...(takesBody && {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              ...schema,
              properties: bodyProps,
              required: [...required].filter((k) => !inPath.has(k)),
            },
            ...(bodyExample && { example: bodyExample }),
          },
        },
      },
    }),
    responses: {
      "200": { description: "OK", content: responseContent },
      "429": RATE_LIMITED_RESPONSE,
      default: {
        description: "Error",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
    security: isPublic
      ? []
      : [
          { apiKey: [] },
          { bearer: [] },
          // Any token works for operations that need no permissions; otherwise any one listed scope.
          ...(oauth
            ? isEmpty(op.permissions)
              ? [{ oauth2: [] }]
              : oauth.scopesFor(op.permissions).map((s) => ({ oauth2: [s] }))
            : []),
        ],
    "x-required-permissions": formatPermissions(op.permissions).split(", ").filter(Boolean),
    ...(op.hints && { "x-agent-hints": op.hints }),
  }
}

/** An OpenAPI 3.1 document for the registry. Serve it at /openapi.json. */
export function openApiDocument(ops: readonly AnyOperation[], info: ApiInfo) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const op of ops) {
    const p = openApiPath(op.path)
    paths[p] = { ...paths[p], [op.method.toLowerCase()]: operationObject(op, info.oauth) }
  }
  return {
    openapi: "3.1.0",
    info: { title: info.title, version: info.version, description: info.description },
    servers: [{ url: info.baseURL }],
    paths,
    components: {
      schemas: { Error: ERROR_SCHEMA },
      securitySchemes: {
        apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
        bearer: { type: "http", scheme: "bearer", description: "API key or OAuth access token" },
        ...(info.oauth && {
          oauth2: {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: info.oauth.authorizationUrl,
                tokenUrl: info.oauth.tokenUrl,
                scopes: info.oauth.scopes,
              },
            },
          },
        }),
      },
    },
  }
}
