import { afterEach, describe, expect, it, vi } from "vitest"
import { AppError, reportError, setErrorReporter, toAppError } from "./index"

afterEach(() => setErrorReporter(undefined))

describe("AppError", () => {
  it("maps code to status and exposes 4xx by default", () => {
    const e = new AppError("NOT_FOUND", "No such project")
    expect(e.status).toBe(404)
    expect(e.toPublic()).toEqual({ code: "NOT_FOUND", message: "No such project" })
  })

  it("hides INTERNAL messages unless exposed", () => {
    expect(new AppError("INTERNAL", "db password wrong").toPublic().message).toBe("Internal error")
    expect(new AppError("INTERNAL", "ok", { expose: true }).toPublic().message).toBe("ok")
  })

  it("maps SESSION_NOT_FRESH to 403 and exposes it", () => {
    const e = new AppError("SESSION_NOT_FRESH", "Sign in again to confirm it's you")
    expect(e.status).toBe(403)
    expect(e.toPublic()).toEqual({
      code: "SESSION_NOT_FRESH",
      message: "Sign in again to confirm it's you",
    })
  })
})

describe("toAppError", () => {
  it("passes AppError through and wraps everything else as INTERNAL", () => {
    const a = new AppError("CONFLICT", "dup")
    expect(toAppError(a)).toBe(a)
    const cause = new Error("boom")
    const wrapped = toAppError(cause)
    expect(wrapped.code).toBe("INTERNAL")
    expect(wrapped.cause).toBe(cause)
    expect(toAppError("str").message).toBe("str")
  })
})

describe("reportError", () => {
  it("sends the normalised error with merged context to the reporter", () => {
    const fn = vi.fn()
    setErrorReporter(fn)
    const e = reportError(new AppError("CONFLICT", "dup", { context: { a: 1 } }), { b: 2 })
    expect(fn).toHaveBeenCalledWith(e, { a: 1, b: 2 })
  })

  it("never throws, even when the reporter does", () => {
    setErrorReporter(() => {
      throw new Error("reporter down")
    })
    expect(() => reportError(new Error("x"))).not.toThrow()
  })

  it("is a no-op without a reporter", () => {
    expect(reportError("x").code).toBe("INTERNAL")
  })
})
