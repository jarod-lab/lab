import { createTestDb } from "@starter/db/testing"
import { organization, project } from "@starter/db"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { callerActsFor, name, OrganizationId, ProjectId, projectInOrg } from "./index"

const caller = (organizationId: string) => ({
  organizationId,
  actor: { type: "user" as const, userId: "u1" },
  grants: [],
  via: "session",
})

describe("callerActsFor", () => {
  it("proves only for the caller's own organization", () => {
    name(OrganizationId("org-a"), (org) => {
      expect(callerActsFor(caller("org-a"), org)?.kind).toBe("CallerActsFor")
      expect(callerActsFor(caller("org-b"), org)).toBeNull()
    })
  })
})

describe("projectInOrg (real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>
  beforeAll(async () => {
    t = await createTestDb()
    const now = new Date()
    await t.db.insert(organization).values([
      { id: "org-a", name: "A", slug: "a", createdAt: now },
      { id: "org-b", name: "B", slug: "b", createdAt: now },
    ])
    await t.db.insert(project).values({ id: "p1", organizationId: "org-a", name: "P" })
  })
  afterAll(() => t.close())

  const check = (projectId: string, orgId: string) =>
    name(
      ProjectId(projectId),
      OrganizationId(orgId),
      async (p, o) => (await projectInOrg(t.db, p, o))?.kind ?? null,
    )

  it("proves a project belongs to its organization", async () => {
    expect(await check("p1", "org-a")).toBe("ProjectInOrg")
  })

  it("refuses another organization's project, and missing ones", async () => {
    expect(await check("p1", "org-b")).toBeNull()
    expect(await check("nope", "org-a")).toBeNull()
  })
})
