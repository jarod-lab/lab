import { describe, expect, it } from "vitest"

import {
  EMPTY_SSO_VALUES,
  domainStatusLabel,
  newProviderId,
  scimBaseUrl,
  ssoFormSchema,
  ssoRegisterBody,
} from "./org-security"

const oidc = {
  ...EMPTY_SSO_VALUES,
  domain: "acme.com",
  issuer: "https://login.acme.com",
  clientId: "abc",
  clientSecret: "shh",
}
const saml = {
  ...EMPTY_SSO_VALUES,
  protocol: "saml" as const,
  domain: "acme.com",
  issuer: "https://idp.acme.com/entity",
  ssoUrl: "https://idp.acme.com/sso",
  certificate: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
}

describe("ssoFormSchema", () => {
  it("accepts a complete OIDC provider and lowercases the domain", () => {
    const result = ssoFormSchema.safeParse({ ...oidc, domain: " Acme.COM " })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.domain).toBe("acme.com")
  })

  it("accepts a complete SAML provider", () => {
    expect(ssoFormSchema.safeParse(saml).success).toBe(true)
  })

  it("names what is missing, per protocol", () => {
    const issues = (values: unknown) => {
      const result = ssoFormSchema.safeParse(values)
      return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."))
    }
    expect(issues({ ...oidc, domain: "localhost" })).toEqual(["domain"])
    expect(issues({ ...oidc, issuer: "login.acme.com" })).toEqual(["issuer"])
    expect(issues({ ...oidc, clientId: "", clientSecret: "" })).toEqual([
      "clientId",
      "clientSecret",
    ])
    expect(issues({ ...saml, ssoUrl: "not a url", certificate: "MIIB" })).toEqual([
      "ssoUrl",
      "certificate",
    ])
  })

  it("does not ask for OIDC fields on a SAML provider", () => {
    expect(ssoFormSchema.safeParse({ ...saml, clientId: "", clientSecret: "" }).success).toBe(true)
  })
})

describe("ssoRegisterBody", () => {
  it("sends the OIDC credentials and claim mapping the plugin requires", () => {
    expect(ssoRegisterBody("org-a", "acme-com-1", oidc)).toEqual({
      providerId: "acme-com-1",
      organizationId: "org-a",
      domain: "acme.com",
      issuer: "https://login.acme.com",
      oidcConfig: {
        clientId: "abc",
        clientSecret: "shh",
        mapping: { email: "email", name: "name" },
      },
    })
  })

  it("sends the SAML entry point, certificate and entity id, and no OIDC config", () => {
    const body = ssoRegisterBody("org-a", "acme-com-2", saml)
    expect(body).not.toHaveProperty("oidcConfig")
    expect(body).toMatchObject({
      organizationId: "org-a",
      samlConfig: {
        entryPoint: "https://idp.acme.com/sso",
        cert: saml.certificate,
        idpMetadata: { entityID: "https://idp.acme.com/entity" },
      },
    })
  })
})

describe("helpers", () => {
  it("makes provider ids from the domain and a suffix", () => {
    expect(newProviderId("acme.co.uk", "9f2c1e4a")).toBe("acme-co-uk-9f2c1e4a")
  })

  it("builds the SCIM base URL from the origin, without a trailing slash", () => {
    expect(scimBaseUrl("https://app.example.com/")).toBe("https://app.example.com/api/auth/scim/v2")
    expect(scimBaseUrl("https://app.example.com")).toBe("https://app.example.com/api/auth/scim/v2")
  })

  it("words the domain status", () => {
    expect(domainStatusLabel(true)).toBe("Domain verified")
    expect(domainStatusLabel(false)).toBe("Domain not verified")
  })
})
