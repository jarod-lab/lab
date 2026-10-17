import { z } from "zod"

// Pure helpers for the organization's Security page: the SSO form's rules, the request body the plugin
// accepts for each protocol, and the SCIM base URL. No network, no React.

export const SSO_PROTOCOLS = ["oidc", "saml"] as const
export type SsoProtocol = (typeof SSO_PROTOCOLS)[number]

export const SSO_PROTOCOL_LABEL: Record<SsoProtocol, string> = {
  oidc: "OpenID Connect",
  saml: "SAML 2.0",
}

/** A bare hostname with at least one dot, e.g. acme.com (one domain per provider here). */
const DOMAIN_PATTERN = /^([a-z0-9-]+\.)+[a-z]{2,}$/

/** The attributes the plugin reads from the identity provider's claims or assertion. */
const CLAIM_MAPPING = { email: "email", name: "name" } as const
const SAML_CLAIM_MAPPING = { email: "email", name: "displayName" } as const

export const ssoFormSchema = z
  .object({
    protocol: z.enum(SSO_PROTOCOLS),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(DOMAIN_PATTERN, "Enter a domain such as acme.com, without http:// or a path."),
    issuer: z.string().trim().url("Enter the issuer's full URL, starting with https://."),
    clientId: z.string().trim(),
    clientSecret: z.string(),
    ssoUrl: z.string().trim(),
    certificate: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.protocol === "oidc") {
      if (values.clientId === "") {
        ctx.addIssue({ code: "custom", path: ["clientId"], message: "Enter the client ID." })
      }
      if (values.clientSecret === "") {
        ctx.addIssue({
          code: "custom",
          path: ["clientSecret"],
          message: "Enter the client secret.",
        })
      }
      return
    }
    if (!z.string().url().safeParse(values.ssoUrl).success) {
      ctx.addIssue({
        code: "custom",
        path: ["ssoUrl"],
        message: "Enter the single sign-on URL from your identity provider.",
      })
    }
    if (!values.certificate.includes("-----BEGIN CERTIFICATE-----")) {
      ctx.addIssue({
        code: "custom",
        path: ["certificate"],
        message:
          "Paste the signing certificate in PEM form, starting with -----BEGIN CERTIFICATE-----.",
      })
    }
  })

export type SsoFormValues = z.infer<typeof ssoFormSchema>

export const EMPTY_SSO_VALUES: SsoFormValues = {
  protocol: "oidc",
  domain: "",
  issuer: "",
  clientId: "",
  clientSecret: "",
  ssoUrl: "",
  certificate: "",
}

/**
 * The body `POST /sso/register` takes for these values. Only the fields the plugin accepts: OIDC carries
 * the client credentials and claim mapping, SAML the entry point, certificate and entity ID.
 */
export function ssoRegisterBody(organizationId: string, providerId: string, values: SsoFormValues) {
  const base = {
    providerId,
    organizationId,
    domain: values.domain,
    issuer: values.issuer,
  }
  if (values.protocol === "oidc") {
    return {
      ...base,
      oidcConfig: {
        clientId: values.clientId,
        clientSecret: values.clientSecret,
        mapping: CLAIM_MAPPING,
      },
    }
  }
  return {
    ...base,
    samlConfig: {
      entryPoint: values.ssoUrl,
      cert: values.certificate,
      idpMetadata: { entityID: values.issuer },
      mapping: SAML_CLAIM_MAPPING,
    },
  }
}

/** A provider id from its domain plus a suffix, so two providers for one domain never collide. */
export function newProviderId(domain: string, suffix: string): string {
  return `${domain.replace(/[^a-z0-9]+/g, "-")}-${suffix}`
}

/** The SCIM base URL an identity provider's connector is pointed at. */
export function scimBaseUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/auth/scim/v2`
}

/** The words for a provider's status: the domain is proven, or not. */
export function domainStatusLabel(verified: boolean): string {
  return verified ? "Domain verified" : "Domain not verified"
}

/** The DNS TXT record that proves a provider's domain: name and value, as the owner adds it. */
export interface DomainVerificationRecord {
  name: string
  value: string
}

/** The plugin keeps the pending token under `_better-auth-token-<providerId>`, on the provider's domain. */
export function domainVerificationRecord(
  providerId: string,
  domain: string,
  token: string,
): DomainVerificationRecord {
  return { name: `_better-auth-token-${providerId}.${domain}`, value: token }
}
