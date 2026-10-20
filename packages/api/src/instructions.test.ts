import { describe, expect, it } from "vitest"
import { z } from "zod"
import { serverInstructions } from "./instructions"
import { defineOperation } from "./operation"

const info = {
  title: "Acme API",
  version: "1.0.0",
  description: "Acme tracks widgets for agents and people.",
  baseURL: "https://api.acme.test",
}

const op = (name: string, extra: Partial<Parameters<typeof defineOperation>[0]> = {}) =>
  defineOperation({
    name,
    method: "GET",
    path: `/v1/${name}`,
    summary: `Do ${name}`,
    description: `Does ${name}.`,
    permissions: {},
    input: z.object({}),
    output: z.object({}),
    examples: [{ input: {}, output: {} }],
    handler: () => ({}),
    ...extra,
  } as Parameters<typeof defineOperation>[0])

const read = op("list_widgets", { hints: { readOnly: true } })
const write = op("create_widget", { method: "POST", hints: { readOnly: false } })
const destroy = op("delete_widget", { method: "DELETE", hints: { destructive: true } })

describe("serverInstructions", () => {
  it("names the server, says credentials act in one organization, and links the full reference", () => {
    const text = serverInstructions(info, [read])
    expect(text.startsWith("Acme API: Acme tracks widgets for agents and people.")).toBe(true)
    expect(text).toContain("Every credential acts in one organization.")
    expect(text).toContain("the error's hint names the OAuth scope or API key permission")
    expect(text).toContain("Full reference: https://api.acme.test/llms-full.txt")
    expect(text).not.toContain("skill.md")
  })

  it("links the skill only when it is served", () => {
    const text = serverInstructions(info, [read], { skill: true })
    expect(text).toContain("Agent guide: https://api.acme.test/skill.md")
  })

  it("asks for an idempotency key only when there are writes", () => {
    expect(serverInstructions(info, [read])).not.toContain("idempotencyKey")
    expect(serverInstructions(info, [read, write])).toContain("Pass a unique `idempotencyKey`")
  })

  it("names the destructive tools to confirm with the person first", () => {
    expect(serverInstructions(info, [read, write])).not.toContain("destructive")
    expect(serverInstructions(info, [read, destroy])).toContain(
      "Confirm with the person before calling the destructive tools (delete_widget).",
    )
  })

  it("explains the approval wait only when request_approval and get_run exist", () => {
    const approval = op("request_approval", { method: "POST" })
    const getRun = op("get_run")
    expect(serverInstructions(info, [approval])).not.toContain("request_approval")
    const text = serverInstructions(info, [approval, getRun])
    expect(text).toContain("call `request_approval`")
    expect(text).toContain("`get_run` shows the approval as approved")
  })

  it("leaves out the operations that are not MCP tools", () => {
    const signup = op("signup", { method: "POST", auth: "none", permissions: {} })
    const person = op("set_my_avatar", { method: "PUT", auth: "person" })
    const operator = op("ramp_flag", { method: "PATCH", audience: "operator" })
    const text = serverInstructions(info, [read, signup, person, operator])
    expect(text).not.toContain("delete_widget")
    expect(text).not.toContain("signup")
    expect(text).not.toContain("set_my_avatar")
    expect(text).not.toContain("ramp_flag")
    expect(text).not.toContain("idempotencyKey")
  })

  it("stays short: well under 1500 characters for a large registry", () => {
    const many = Array.from({ length: 80 }, (_, i) => op(`op_${i}`, { method: "POST" }))
    const text = serverInstructions(info, [...many, destroy, read], { skill: true })
    expect(text.length).toBeLessThan(1500)
  })
})
