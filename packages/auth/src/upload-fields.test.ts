import { describe, expect, it } from "vitest"
import { uploadFieldRefusal } from "./upload-fields"

describe("uploadFieldRefusal", () => {
  it("refuses a set logo on organization create (top level) and update (under data)", () => {
    expect(
      uploadFieldRefusal("/organization/create", { name: "A", logo: "https://x/y.png" }),
    ).toMatch(/set_organization_logo/)
    expect(
      uploadFieldRefusal("/organization/update", { data: { logo: "https://x/y.png" } }),
    ).toMatch(/set_organization_logo/)
  })

  it("refuses a set image on update-user and email sign-up", () => {
    expect(uploadFieldRefusal("/update-user", { image: "https://x/y.png" })).toMatch(
      /set_my_avatar/,
    )
    expect(uploadFieldRefusal("/sign-up/email", { image: "https://x/y.png" })).toMatch(
      /set_my_avatar/,
    )
  })

  it("lets clears, other fields and other paths through", () => {
    expect(uploadFieldRefusal("/organization/update", { data: { logo: null } })).toBeUndefined()
    expect(uploadFieldRefusal("/update-user", { image: null, name: "A" })).toBeUndefined()
    expect(uploadFieldRefusal("/update-user", { name: "A" })).toBeUndefined()
    expect(uploadFieldRefusal("/organization/update", { data: { name: "B" } })).toBeUndefined()
    expect(uploadFieldRefusal("/organization/update", { logo: "https://x/y.png" })).toBeUndefined()
    expect(uploadFieldRefusal("/sign-in/email", { image: "https://x/y.png" })).toBeUndefined()
    expect(uploadFieldRefusal("/update-user", undefined)).toBeUndefined()
  })
})
