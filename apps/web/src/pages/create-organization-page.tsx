import { useForm } from "@tanstack/react-form"
import { useDebouncedValue } from "@tanstack/react-pacer"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useId, useState } from "react"
import { z } from "zod"

import { Button } from "@starter/ui/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@starter/ui/components/ui/field"
import { Input } from "@starter/ui/components/ui/input"
import { SlugField, type SlugStatus } from "@starter/ui/dplus/shell/slug-field"

import { qk } from "../lib/query-keys"
import { type SlugProblem, slugify, slugProblem } from "../lib/org-slug"
import type { WebAuth, WebOrganization } from "../lib/web-auth"
import { useSetActiveOrganization } from "../containers/shell-data"
import { WebError } from "../lib/web-auth"

const PROBLEM_TEXT: Record<Exclude<SlugProblem, null>, string> = {
  empty: "Enter a URL for the organization.",
  shape: "Use lowercase letters, numbers and hyphens, up to 48 characters.",
  reserved: "That address is reserved. Choose another.",
}

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for the organization.")
    .max(80, "Use 80 characters or fewer."),
  slug: z.string().refine((value) => slugProblem(value) === null, {
    message: "Choose a valid organization URL.",
  }),
})

export interface CreateOrganizationPageProps {
  auth: WebAuth
  /** Shown before the slug, e.g. "app.example.com/". */
  host: string
  /** After the organization exists and is the active one. */
  onCreated: (organization: WebOrganization) => void
  onCancel: () => void
}

/**
 * Create an organization (the board's "Create an organization"). The slug follows the name until
 * the person edits it, and its availability is checked after a short pause. Both client and server
 * refuse reserved slugs; the server is the one that counts.
 */
export function CreateOrganizationPage({
  auth,
  host,
  onCreated,
  onCancel,
}: CreateOrganizationPageProps) {
  const nameId = useId()
  const queryClient = useQueryClient()
  const setActive = useSetActiveOrganization(auth)
  const [slugTouched, setSlugTouched] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { name: "", slug: "" },
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      setSubmitError(null)
      try {
        const organization = await auth.createOrganization({
          name: value.name.trim(),
          slug: value.slug,
        })
        await queryClient.invalidateQueries({ queryKey: qk.organizations() })
        await setActive.mutateAsync(organization.id)
        onCreated(organization)
      } catch (error) {
        setSubmitError(
          error instanceof WebError || error instanceof Error
            ? error.message
            : "Could not create the organization.",
        )
      }
    },
  })

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Create an organization</h1>
        <p className="text-muted-foreground">
          Organizations hold your agents, members, API keys and billing. You can belong to several.
        </p>
      </header>

      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={nameId}>Organization name</FieldLabel>
              <Input
                id={nameId}
                name="name"
                value={field.state.value}
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                onChange={(event) => {
                  const name = event.currentTarget.value
                  field.handleChange(name)
                  if (!slugTouched) form.setFieldValue("slug", slugify(name))
                }}
                onBlur={field.handleBlur}
                autoComplete="organization"
              />
              {field.state.meta.errors.length > 0 ? (
                <FieldError>{messageOf(field.state.meta.errors)}</FieldError>
              ) : null}
            </Field>
          )}
        </form.Field>

        <form.Field name="slug">
          {(field) => (
            <SlugBlock
              auth={auth}
              host={host}
              value={field.state.value}
              onChange={(slug) => {
                setSlugTouched(true)
                field.handleChange(slug)
              }}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Logo (optional)</p>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-lg border-2 border-foreground bg-muted font-semibold"
            >
              {(form.state.values.name.trim()[0] ?? "A").toUpperCase()}
            </span>
            <Button type="button" variant="outline" disabled aria-describedby="logo-reason">
              Upload
            </Button>
          </div>
          <FieldDescription id="logo-reason">
            Logo upload is not available yet, so the first letter is used. You can add one later.
          </FieldDescription>
        </div>

        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>You'll be the Owner of the organization.</li>
          <li>You can invite teammates later from its Members page.</li>
          <li>Plan: [PLACEHOLDER] (billing is not built yet).</li>
        </ol>

        {submitError ? (
          <p role="alert" className="text-destructive">
            {submitError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting || setActive.isPending}>
                {isSubmitting ? "Creating…" : "Create organization"}
              </Button>
            )}
          </form.Subscribe>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}

function messageOf(errors: unknown[]): string {
  const first = errors[0]
  if (typeof first === "string") return first
  if (first && typeof first === "object" && "message" in first) return String(first.message)
  return "Check this field."
}

/** The slug field with its availability: checked after the value settles, never for a bad shape. */
function SlugBlock({
  auth,
  host,
  value,
  onChange,
  errors,
}: {
  auth: WebAuth
  host: string
  value: string
  onChange: (slug: string) => void
  errors: unknown[]
}) {
  const [settled] = useDebouncedValue(value, { wait: 300 })
  const problem = slugProblem(value)
  const check = useQuery({
    queryKey: ["organization-slug-available", settled],
    queryFn: () => auth.checkSlug(settled),
    enabled: settled.length > 0 && slugProblem(settled) === null,
    retry: false,
    staleTime: 0,
  })

  let status: SlugStatus = "idle"
  if (value.length > 0) {
    if (problem === "shape") status = "invalid"
    else if (problem === "reserved") status = "invalid"
    else if (problem === null) {
      if (settled !== value || check.isPending || check.isFetching) status = "checking"
      else if (check.data === true) status = "available"
      else if (check.data === false) status = "taken"
    }
  }
  const problemText = problem ? PROBLEM_TEXT[problem] : null
  const errorText = errors.length > 0 ? messageOf(errors) : null

  return (
    <div className="flex flex-col gap-1.5">
      <SlugField
        label="URL"
        prefix={`${host}/`}
        value={value}
        name="slug"
        status={status}
        onChange={onChange}
      />
      {problemText ? <FieldDescription>{problemText}</FieldDescription> : null}
      {check.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not check this address. Try again in a moment.
        </p>
      ) : null}
      {errorText && !problemText ? <p className="text-sm text-destructive">{errorText}</p> : null}
    </div>
  )
}
