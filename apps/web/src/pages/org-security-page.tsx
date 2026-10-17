import { useForm } from "@tanstack/react-form"
import { useId, useState } from "react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@starter/ui/components/ui/alert-dialog"
import { Button } from "@starter/ui/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@starter/ui/components/ui/field"
import { Input } from "@starter/ui/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@starter/ui/components/ui/native-select"
import { Textarea } from "@starter/ui/components/ui/textarea"
import { CopyField } from "@starter/ui/dplus/shell/copy-field"
import { DangerAction } from "@starter/ui/dplus/shell/danger-zone"
import { type RenderLink, anchorLink } from "@starter/ui/dplus/shell/link"
import { SettingsHeader } from "@starter/ui/dplus/shell/settings-header"
import { ViewOnlyNotice } from "@starter/ui/dplus/shell/view-only-notice"
import { Status } from "@starter/ui/dplus/status"

import type { ScimToken, SsoProvider } from "../lib/org-security-api"
import {
  EMPTY_SSO_VALUES,
  SSO_PROTOCOL_LABEL,
  type DomainVerificationRecord,
  type SsoFormValues,
  domainStatusLabel,
  scimBaseUrl,
  ssoFormSchema,
} from "../lib/org-security"
import { settingsTabs } from "../lib/org-settings"

export interface OrgSecurityPageProps {
  organization: { name: string; slug: string }
  /** The app's origin, for the SCIM base URL. */
  origin: string
  /** "Owner", "Admin", "Member" or "Viewer": the caller's role here. */
  roleLabel: string
  /** The caller may see the providers (the catalog's sso:read, owner only). */
  canRead: boolean
  /** The caller may add, delete providers and mint a SCIM token (sso:update and scim:create, owner only). */
  canChange: boolean
  /** The registered providers; undefined while loading. */
  providers: SsoProvider[] | undefined
  providersError: boolean
  /** The SCIM token minted in this visit, shown once; null otherwise. */
  scimToken: ScimToken | null
  onRegister: (values: SsoFormValues) => Promise<void>
  onDelete: (providerId: string) => Promise<void>
  /** Starts the domain check: resolves with the TXT record the owner adds. */
  onRequestVerification: (providerId: string) => Promise<DomainVerificationRecord>
  /** Looks for the TXT record now. Rejects with the server's reason while it is missing. */
  onCheckVerification: (providerId: string) => Promise<void>
  onGenerateScim: () => Promise<void>
  onDismissScim: () => void
  renderLink?: RenderLink
}

/** The organization's Security page: single sign-on providers and SCIM provisioning (owner only). */
export function OrgSecurityPage({
  organization,
  origin,
  roleLabel,
  canRead,
  canChange,
  providers,
  providersError,
  scimToken,
  onRegister,
  onDelete,
  onRequestVerification,
  onCheckVerification,
  onGenerateScim,
  onDismissScim,
  renderLink = anchorLink,
}: OrgSecurityPageProps) {
  const tabs = settingsTabs(organization.slug)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsHeader
        title="Organization settings"
        context={`${organization.name} · you are ${roleLabel}`}
        tabs={tabs}
        activeTab="security"
        renderLink={renderLink}
      />

      <main className="flex max-w-[720px] flex-col gap-8 px-4 py-6 md:px-9">
        {canRead ? (
          <>
            <SsoSection
              providers={providers}
              providersError={providersError}
              canChange={canChange}
              onRegister={onRegister}
              onDelete={onDelete}
              onRequestVerification={onRequestVerification}
              onCheckVerification={onCheckVerification}
            />
            {canChange ? (
              <ScimSection
                origin={origin}
                token={scimToken}
                onGenerate={onGenerateScim}
                onDismiss={onDismissScim}
              />
            ) : null}
          </>
        ) : (
          <ViewOnlyNotice subject={organization.name}>
            Only an owner can see or change single sign-on and SCIM provisioning. Ask an owner to
            change these settings.
          </ViewOnlyNotice>
        )}
      </main>
    </div>
  )
}

function messageOf(errors: unknown[]): string {
  const first = errors[0]
  if (typeof first === "string") return first
  if (first && typeof first === "object" && "message" in first) {
    return String((first as { message?: unknown }).message ?? "")
  }
  return ""
}

function SsoSection({
  providers,
  providersError,
  canChange,
  onRegister,
  onDelete,
  onRequestVerification,
  onCheckVerification,
}: {
  providers: SsoProvider[] | undefined
  providersError: boolean
  canChange: boolean
  onRegister: OrgSecurityPageProps["onRegister"]
  onDelete: OrgSecurityPageProps["onDelete"]
  onRequestVerification: OrgSecurityPageProps["onRequestVerification"]
  onCheckVerification: OrgSecurityPageProps["onCheckVerification"]
}) {
  const [adding, setAdding] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<SsoProvider | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState<{
    providerId: string
    record: DomainVerificationRecord
  } | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function startVerify(providerId: string) {
    setActionError(null)
    setVerifyError(null)
    try {
      setVerifying({ providerId, record: await onRequestVerification(providerId) })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not start the domain check.")
    }
  }

  async function checkNow() {
    if (!verifying) return
    setChecking(true)
    setVerifyError(null)
    try {
      await onCheckVerification(verifying.providerId)
      setVerifying(null)
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : "Could not verify the domain.")
    } finally {
      setChecking(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    setActionError(null)
    try {
      await onDelete(target.providerId)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete the provider.")
    }
  }

  return (
    <section aria-labelledby="sso-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="sso-heading" className="text-lg font-semibold">
          Single sign-on
        </h2>
        <p className="text-sm text-muted-foreground">
          People who sign in with an email address at a provider's domain are sent to that
          provider's identity provider.
        </p>
      </div>

      {providersError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load the single sign-on providers.
        </p>
      ) : providers === undefined ? (
        <output className="block text-sm text-muted-foreground">Loading…</output>
      ) : providers.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-muted-foreground p-3.5 text-sm">
          No providers yet. Add one to let people at your domain sign in with your identity
          provider.
        </p>
      ) : (
        <ul className="flex flex-col divide-y-2 divide-border rounded-lg border-2 border-foreground">
          {providers.map((provider) => (
            <li
              key={provider.providerId}
              aria-label={provider.domain}
              className="flex flex-col gap-3 p-4"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-semibold break-all">{provider.domain}</p>
                <p className="text-sm text-muted-foreground">{SSO_PROTOCOL_LABEL[provider.type]}</p>
                <Status state={provider.domainVerified ? "done" : "queued"}>
                  {domainStatusLabel(provider.domainVerified)}
                </Status>
                <p className="font-mono text-xs break-all text-muted-foreground">
                  {provider.issuer}
                </p>
              </div>
              {canChange && !provider.domainVerified ? (
                verifying?.providerId === provider.providerId ? (
                  <VerificationPanel
                    record={verifying.record}
                    error={verifyError}
                    checking={checking}
                    onCheck={() => void checkNow()}
                    onClose={() => {
                      setVerifying(null)
                      setVerifyError(null)
                    }}
                  />
                ) : (
                  <div>
                    <Button
                      variant="outline"
                      disabled={verifying !== null}
                      onClick={() => void startVerify(provider.providerId)}
                    >
                      Verify domain
                    </Button>
                  </div>
                )
              ) : null}
              <DangerAction
                label="Delete provider"
                consequence={`People at ${provider.domain} can no longer sign in with SSO.`}
                disabled={!canChange}
                disabledReason="Only an owner can delete a provider."
                onAction={() => setPendingDelete(provider)}
              />
            </li>
          ))}
        </ul>
      )}

      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {canChange && providers !== undefined && !providersError ? (
        adding ? (
          <ProviderForm
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              await onRegister(values)
              setAdding(false)
            }}
          />
        ) : (
          <div>
            <Button variant="outline" onClick={() => setAdding(true)}>
              Add a provider
            </Button>
          </div>
        )
      ) : null}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the {pendingDelete?.domain} provider?</AlertDialogTitle>
            <AlertDialogDescription>
              People at {pendingDelete?.domain} can no longer sign in with SSO.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              Delete provider
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function VerificationPanel({
  record,
  error,
  checking,
  onCheck,
  onClose,
}: {
  record: DomainVerificationRecord
  error: string | null
  checking: boolean
  onCheck: () => void
  onClose: () => void
}) {
  return (
    <section
      aria-label="Domain verification"
      className="flex flex-col gap-3 rounded-lg border-2 border-foreground p-4"
    >
      <p className="text-sm">
        Add this TXT record to the domain's DNS, then check. Changes to DNS can take a while to
        appear.
      </p>
      <CopyField label="Record name" value={record.name} />
      <CopyField label="Record value" value={record.value} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onCheck} disabled={checking}>
          Check now
        </Button>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </section>
  )
}

function ProviderForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (values: SsoFormValues) => Promise<void>
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const ids = {
    protocol: useId(),
    domain: useId(),
    issuer: useId(),
    clientId: useId(),
    clientSecret: useId(),
    ssoUrl: useId(),
    certificate: useId(),
  }

  const form = useForm({
    defaultValues: EMPTY_SSO_VALUES,
    validators: { onChange: ssoFormSchema },
    onSubmit: async ({ value }) => {
      setFormError(null)
      try {
        await onSubmit(value)
        // The secret is write-only: clear it with the rest of the form once saved.
        form.reset()
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Could not add the provider.")
      }
    },
  })

  return (
    <form
      noValidate
      aria-label="Add a provider"
      className="flex flex-col gap-4 rounded-lg border-2 border-foreground p-4"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field name="protocol">
        {(field) => (
          <Field>
            <FieldLabel htmlFor={ids.protocol}>Protocol</FieldLabel>
            <NativeSelect
              id={ids.protocol}
              name="protocol"
              value={field.state.value}
              onChange={(event) =>
                field.handleChange(event.currentTarget.value as SsoFormValues["protocol"])
              }
            >
              <NativeSelectOption value="oidc">OpenID Connect</NativeSelectOption>
              <NativeSelectOption value="saml">SAML 2.0</NativeSelectOption>
            </NativeSelect>
          </Field>
        )}
      </form.Field>

      <form.Field name="domain">
        {(field) => (
          <Field>
            <FieldLabel htmlFor={ids.domain}>Email domain</FieldLabel>
            <Input
              id={ids.domain}
              name="domain"
              placeholder="acme.com"
              autoComplete="off"
              value={field.state.value}
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
              onBlur={field.handleBlur}
            />
            {field.state.meta.errors.length > 0 ? (
              <FieldError>{messageOf(field.state.meta.errors)}</FieldError>
            ) : null}
          </Field>
        )}
      </form.Field>

      <form.Field name="issuer">
        {(field) => (
          <Field>
            <FieldLabel htmlFor={ids.issuer}>Issuer URL</FieldLabel>
            <FieldDescription>From your identity provider's settings.</FieldDescription>
            <Input
              id={ids.issuer}
              name="issuer"
              type="url"
              placeholder="https://login.example.com"
              autoComplete="off"
              value={field.state.value}
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
              onBlur={field.handleBlur}
            />
            {field.state.meta.errors.length > 0 ? (
              <FieldError>{messageOf(field.state.meta.errors)}</FieldError>
            ) : null}
          </Field>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.protocol}>
        {(protocol) =>
          protocol === "oidc" ? (
            <>
              <form.Field name="clientId">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={ids.clientId}>Client ID</FieldLabel>
                    <Input
                      id={ids.clientId}
                      name="clientId"
                      autoComplete="off"
                      value={field.state.value}
                      aria-invalid={field.state.meta.errors.length > 0 || undefined}
                      onChange={(event) => field.handleChange(event.currentTarget.value)}
                      onBlur={field.handleBlur}
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <FieldError>{messageOf(field.state.meta.errors)}</FieldError>
                    ) : null}
                  </Field>
                )}
              </form.Field>
              <form.Field name="clientSecret">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={ids.clientSecret}>Client secret</FieldLabel>
                    <FieldDescription>Saved on the server and never shown again.</FieldDescription>
                    <Input
                      id={ids.clientSecret}
                      name="clientSecret"
                      type="password"
                      autoComplete="off"
                      value={field.state.value}
                      aria-invalid={field.state.meta.errors.length > 0 || undefined}
                      onChange={(event) => field.handleChange(event.currentTarget.value)}
                      onBlur={field.handleBlur}
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <FieldError>{messageOf(field.state.meta.errors)}</FieldError>
                    ) : null}
                  </Field>
                )}
              </form.Field>
            </>
          ) : (
            <>
              <form.Field name="ssoUrl">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={ids.ssoUrl}>Single sign-on URL</FieldLabel>
                    <Input
                      id={ids.ssoUrl}
                      name="ssoUrl"
                      type="url"
                      placeholder="https://idp.example.com/sso/saml"
                      autoComplete="off"
                      value={field.state.value}
                      aria-invalid={field.state.meta.errors.length > 0 || undefined}
                      onChange={(event) => field.handleChange(event.currentTarget.value)}
                      onBlur={field.handleBlur}
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <FieldError>{messageOf(field.state.meta.errors)}</FieldError>
                    ) : null}
                  </Field>
                )}
              </form.Field>
              <form.Field name="certificate">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={ids.certificate}>Signing certificate</FieldLabel>
                    <FieldDescription>
                      The PEM certificate from your identity provider.
                    </FieldDescription>
                    <Textarea
                      id={ids.certificate}
                      name="certificate"
                      rows={5}
                      className="font-mono text-xs"
                      value={field.state.value}
                      aria-invalid={field.state.meta.errors.length > 0 || undefined}
                      onChange={(event) => field.handleChange(event.currentTarget.value)}
                      onBlur={field.handleBlur}
                    />
                    {field.state.meta.errors.length > 0 ? (
                      <FieldError>{messageOf(field.state.meta.errors)}</FieldError>
                    ) : null}
                  </Field>
                )}
              </form.Field>
            </>
          )
        }
      </form.Subscribe>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit">Add provider</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function ScimSection({
  origin,
  token,
  onGenerate,
  onDismiss,
}: {
  origin: string
  token: ScimToken | null
  onGenerate: () => Promise<void>
  onDismiss: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function generate() {
    setError(null)
    setBusy(true)
    try {
      await onGenerate()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate a SCIM token.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="scim-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="scim-heading" className="text-lg font-semibold">
          SCIM provisioning
        </h2>
        <p className="text-sm text-muted-foreground">
          Your identity provider can create and update people through SCIM. Generate a token for its
          connector, and point the connector at the base URL below.
        </p>
      </div>

      <CopyField label="SCIM base URL" value={scimBaseUrl(origin)} />

      {token ? (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-foreground p-4">
          <CopyField label="SCIM token" value={token.token} />
          <p className="text-sm font-semibold">You won't see it again. Copy it now.</p>
          <p className="text-sm text-muted-foreground">
            The token expires in {token.expiresInDays} days.
          </p>
          <div>
            <Button variant="outline" onClick={onDismiss}>
              I've copied it
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="outline" onClick={() => void generate()} disabled={busy}>
            Generate SCIM token
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1 border-l-2 border-muted-foreground pl-3.5 text-sm">
        <p>Provisioned users don't join this organization yet.</p>
        <p className="text-muted-foreground">Tokens can't be listed or revoked here yet.</p>
      </div>
    </section>
  )
}
