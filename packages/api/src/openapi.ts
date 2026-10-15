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
      properties: { code: { type: "string" }, message: { type: "string" } },
    },
  },
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
  const parameters = Object.entries(props)
    .filter(([key]) => inPath.has(key) || !hasBody)
    .map(([key, s]) => ({
      name: key,
      in: inPath.has(key) ? "path" : "query",
      required: inPath.has(key) || required.has(key),
      schema: s,
    }))
  const bodyProps = Object.fromEntries(Object.entries(props).filter(([k]) => !inPath.has(k)))
  const example = op.examples?.[0]
  const responseContent = { "application/json": { schema: outputSchema(op) } }
  return {
    operationId: op.name,
    summary: op.summary,
    description: op.description,
    ...(parameters.length > 0 && { parameters }),
    ...(hasBody && {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              ...schema,
              properties: bodyProps,
              required: [...required].filter((k) => !inPath.has(k)),
            },
            ...(example && { example: example.input }),
          },
        },
      },
    }),
    responses: {
      "200": { description: "OK", content: responseContent },
      default: {
        description: "Error",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
    security: [
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
