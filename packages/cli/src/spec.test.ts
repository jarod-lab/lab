import { describe, expect, it } from "vitest"
import {
  buildRequest,
  type Operation,
  type OpenApiDocument,
  findOperation,
  listOperations,
} from "./spec"

const doc: OpenApiDocument = {
  paths: {
    "/v1/things/{id}": {
      // Path-level parameters apply to every method on the path, unless the method overrides them.
      parameters: [
        { name: "id", in: "path", required: true },
        { name: "x-trace", in: "header" },
      ],
      get: {
        operationId: "get_thing",
        summary: "Get one",
        parameters: [
          { name: "x-trace", in: "header" },
          { name: "expand", in: "query" },
        ],
      },
      patch: { operationId: "update_thing", requestBody: { content: {} } },
      // An operation without an id is not callable, so it is skipped.
      delete: { summary: "no id" },
    },
  },
}

const op = (name: string): Operation => {
  const found = findOperation(doc, name)
  if (!found) throw new Error(`missing ${name}`)
  return found
}

describe("listOperations", () => {
  it("lists operations with an id, in path order, with path-level parameters merged", () => {
    const ops = listOperations(doc)
    expect(ops.map((o) => [o.name, o.method, o.path])).toEqual([
      ["get_thing", "GET", "/v1/things/{id}"],
      ["update_thing", "PATCH", "/v1/things/{id}"],
    ])
    // The method's own x-trace replaces the path-level one; `id` is inherited.
    expect(
      op("get_thing")
        .parameters.map((p) => `${p.in}:${p.name}`)
        .sort(),
    ).toEqual(["header:x-trace", "path:id", "query:expand"])
    expect(op("update_thing").hasBody).toBe(true)
  })

  it("returns nothing for a document without paths", () => {
    expect(listOperations({})).toEqual([])
  })

  it("finds nothing for an unknown name", () => {
    expect(findOperation(doc, "nope")).toBeUndefined()
  })
})

describe("buildRequest", () => {
  it("routes path, query and header parameters, and the rest into the body", () => {
    const built = buildRequest(op("update_thing"), {
      id: "t_1",
      "x-trace": 7,
      name: "New",
      tags: ["a"],
    })
    expect(built).toEqual({
      path: { id: "t_1" },
      query: {},
      headers: { "x-trace": "7" },
      body: { name: "New", tags: ["a"] },
    })
  })

  it("sends extra fields as query for an operation with no body", () => {
    const built = buildRequest(op("get_thing"), { id: "t_1", expand: "owner", page: 2 })
    expect(built.query).toEqual({ expand: "owner", page: 2 })
    expect(built.body).toBeUndefined()
  })

  it("skips null and undefined values rather than sending them", () => {
    const built = buildRequest(op("get_thing"), { id: "t_1", expand: null, "x-trace": undefined })
    expect(built.query).toEqual({})
    expect(built.headers).toEqual({})
  })

  it("leaves the body out when the input has nothing left for it", () => {
    const built = buildRequest(op("update_thing"), { id: "t_1" })
    expect(built.body).toBeUndefined()
  })

  it("rejects a path template that the input does not fill", () => {
    const bare: Operation = { ...op("update_thing"), parameters: [] }
    expect(() => buildRequest(bare, {})).toThrow('Missing path parameter "id"')
  })

  it("rejects a declared required path parameter that is absent", () => {
    expect(() => buildRequest(op("get_thing"), {})).toThrow('Missing path parameter "id"')
  })
})
