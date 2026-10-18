import { useForm } from "@tanstack/react-form"
import { useId, useRef, useState } from "react"
import { z } from "zod"

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@starter/ui/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@starter/ui/components/ui/field"
import { Input } from "@starter/ui/components/ui/input"
import { CopyField } from "@starter/ui/dplus/shell/copy-field"
import type { RenderLink } from "@starter/ui/dplus/shell/link"

import {
  type PasskeyInfo,
  type TotpSetup,
  accountErrorMessage,
  totpSecretOf,
} from "../lib/account-api"
import { dateLabel, relativeTime } from "../lib/account-format"
import { fieldMessage } from "../lib/messages"

// The sections of the Security page (board Security). Each takes its data and callbacks as props.
// Errors a call throws are shown in the section; the container has already mapped their copy.

// Rows wrap on phones: the text keeps at least 12rem and the actions drop below it.
const ROW = "flex flex-wrap items-center gap-3 border-t border-border py-2.5"
const ROW_LAST = "flex flex-wrap items-center gap-3 border-y border-border py-2.5"
const TEXT = "flex min-w-[12rem] flex-1 flex-col leading-snug"
const META = "text-[13px] text-muted-foreground"

const passkeyNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for this passkey.")
    .max(80, "Use 80 characters or fewer."),
})
const passwordSchema = z.object({ password: z.string().min(1, "Enter your password.") })
const codeSchema = z.object({
  code: z.string().trim().min(1, "Enter the six-digit code from your app."),
})

/** The first Zod message for a field, shown under it. Empty when the field is valid. */
function FieldErrorLine({ errors }: { errors: unknown[] }) {
  return errors.length > 0 ? <FieldError>{fieldMessage(errors)}</FieldError> : null
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

function useAction<T extends unknown[]>(run: (...args: T) => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const call = async (...args: T) => {
    setBusy(true)
    setError(null)
    try {
      await run(...args)
      return true
    } catch (caught) {
      setError(accountErrorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, call }
}

// ---- Passkeys -------------------------------------------------------------------------------------

export interface PasskeysSectionProps {
  passkeys: PasskeyInfo[]
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

export function PasskeysSection({ passkeys, onAdd, onRename, onRemove }: PasskeysSectionProps) {
  const headingId = useId()
  const [adding, setAdding] = useState(false)
  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <div className="mb-1.5 flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={headingId} className="text-base font-bold">
            Passkeys
          </h2>
          <span className="text-[13.5px] text-muted-foreground">
            Sign in with Touch ID, Face ID or a security key. Nothing to remember, nothing to phish.
          </span>
        </div>
        <Button variant="default" onClick={() => setAdding(true)}>
          Add a passkey
        </Button>
      </div>
      {passkeys.length === 0 ? (
        <p className={ROW}>
          <span className={META}>No passkeys yet.</span>
        </p>
      ) : null}
      {passkeys.map((passkey) => (
        <PasskeyRow key={passkey.id} passkey={passkey} onRename={onRename} onRemove={onRemove} />
      ))}
      <AddPasskeyDialog open={adding} onOpenChange={setAdding} onAdd={onAdd} />
    </section>
  )
}

function PasskeyRow({
  passkey,
  onRename,
  onRemove,
}: {
  passkey: PasskeyInfo
  onRename: (id: string, name: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const label = passkey.name || "Passkey"
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const renameAction = useAction(async (name: string) => {
    await onRename(passkey.id, name)
    setEditing(false)
  })
  const removeAction = useAction(async () => {
    await onRemove(passkey.id)
    setConfirming(false)
  })

  if (editing) {
    return (
      <RenameForm
        label={label}
        busy={renameAction.busy}
        error={renameAction.error}
        onSave={async (name) => {
          await renameAction.call(name)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className={ROW}>
      <div className={TEXT}>
        <span className="font-semibold">{label}</span>
        <span className={META}>
          {passkey.createdAt ? `Added ${dateLabel(passkey.createdAt)}` : "Added on this account"}
        </span>
      </div>
      <Button variant="outline" aria-label={`Rename ${label}`} onClick={() => setEditing(true)}>
        Rename
      </Button>
      <Button
        variant="outline"
        className="border-destructive text-destructive"
        aria-label={`Remove ${label}`}
        onClick={() => setConfirming(true)}
      >
        Remove
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't be able to sign in with this passkey any more. Your other ways in stay as
              they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ErrorLine message={removeAction.error} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={removeAction.busy}
              onClick={() => void removeAction.call()}
            >
              {removeAction.busy ? "Removing…" : "Remove passkey"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Inline rename of a passkey. Mounts when editing starts, so it always opens on the current name. */
function RenameForm({
  label,
  busy,
  error,
  onSave,
  onCancel,
}: {
  label: string
  busy: boolean
  error: string | null
  onSave: (name: string) => Promise<void>
  onCancel: () => void
}) {
  const inputId = useId()
  const form = useForm({
    defaultValues: { name: label },
    validators: { onSubmit: passkeyNameSchema },
    onSubmit: async ({ value }) => {
      await onSave(value.name.trim())
    },
  })
  return (
    <form
      noValidate
      className={ROW}
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor={inputId} className="sr-only">
              Passkey name
            </FieldLabel>
            <Input
              id={inputId}
              value={field.state.value}
              maxLength={80}
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
              onBlur={field.handleBlur}
            />
            <FieldErrorLine errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
      <Button type="submit" disabled={busy}>
        Save name
      </Button>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <ErrorLine message={error} />
    </form>
  )
}

function AddPasskeyDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (name: string) => Promise<void>
}) {
  const inputId = useId()
  const action = useAction(async (value: string) => {
    await onAdd(value)
    onOpenChange(false)
  })
  const form = useForm({
    defaultValues: { name: "This device" },
    validators: { onSubmit: passkeyNameSchema },
    onSubmit: async ({ value }) => {
      await action.call(value.name.trim())
    },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a passkey</DialogTitle>
          <DialogDescription>
            Your browser will ask you to confirm with this device. The name is only for your list.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <form.Field name="name">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={inputId}>Passkey name</FieldLabel>
                <Input
                  id={inputId}
                  value={field.state.value}
                  maxLength={80}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                />
                <FieldErrorLine errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <ErrorLine message={action.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={action.busy}>
              {action.busy ? "Waiting for your device…" : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---- Two-factor -----------------------------------------------------------------------------------

export const BACKUP_CODE_COUNT = 10

export interface TwoFactorSectionProps {
  enabled: boolean
  enabledAt: string | Date | null
  backupCodesRemaining: number | null
  /** False for an account without a password: enabling and the codes both ask for one. */
  hasPassword: boolean
  onEnable: (password: string) => Promise<TotpSetup>
  onConfirm: (code: string) => Promise<void>
  onDisable: (password: string) => Promise<void>
  onNewCodes: (password: string) => Promise<string[]>
}

export function TwoFactorSection(props: TwoFactorSectionProps) {
  const headingId = useId()
  const [enrolling, setEnrolling] = useState(false)
  const [turningOff, setTurningOff] = useState(false)
  const [newCodes, setNewCodes] = useState(false)
  const noPassword = !props.hasPassword
  const reason = noPassword
    ? "This account has no password. Two-factor asks for one to confirm it's you."
    : undefined

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-base font-bold">
        Two-factor authentication
      </h2>
      <div className={ROW}>
        <div className={TEXT}>
          <span className="font-semibold">Authenticator app</span>
          <span className={META}>
            {props.enabled
              ? `On since ${dateLabel(props.enabledAt) || "a while ago"} · asked when you sign in with a password`
              : "Off · add a second step at sign-in with an authenticator app"}
          </span>
          {reason && !props.enabled ? <span className={META}>{reason}</span> : null}
        </div>
        {props.enabled ? (
          <Button variant="outline" onClick={() => setTurningOff(true)}>
            Turn off
          </Button>
        ) : (
          <Button variant="default" disabled={noPassword} onClick={() => setEnrolling(true)}>
            Turn on
          </Button>
        )}
      </div>
      <div className={ROW_LAST}>
        <div className={TEXT}>
          <span className="font-semibold">Backup codes</span>
          <span className={META}>
            {props.enabled && props.backupCodesRemaining !== null
              ? `${props.backupCodesRemaining} of ${BACKUP_CODE_COUNT} left · each works once`
              : "Available once two-factor is on"}
          </span>
        </div>
        <Button variant="outline" disabled aria-describedby={`${headingId}-codes`}>
          View codes
        </Button>
        <Button
          variant="outline"
          disabled={!props.enabled || noPassword}
          onClick={() => setNewCodes(true)}
        >
          Make new codes
        </Button>
      </div>
      <p id={`${headingId}-codes`} className={META}>
        Codes are shown once, when they are made. To replace them, make new codes.
      </p>

      {enrolling ? (
        <EnrolDialog
          onClose={() => setEnrolling(false)}
          onEnable={props.onEnable}
          onConfirm={props.onConfirm}
        />
      ) : null}
      <TurnOffDialog open={turningOff} onOpenChange={setTurningOff} onDisable={props.onDisable} />
      <NewCodesDialog open={newCodes} onOpenChange={setNewCodes} onNewCodes={props.onNewCodes} />
    </section>
  )
}

type EnrolStep = "password" | "scan" | "codes"

function EnrolDialog({
  onClose,
  onEnable,
  onConfirm,
}: {
  onClose: () => void
  onEnable: (password: string) => Promise<TotpSetup>
  onConfirm: (code: string) => Promise<void>
}) {
  const [step, setStep] = useState<EnrolStep>("password")
  // The secret and codes live in this dialog only: not in a query, gone when it closes.
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [secret, setSecret] = useState("")
  const passwordId = useId()
  const codeId = useId()
  const password = useAction(async (value: string) => {
    const result = await onEnable(value)
    setSetup(result)
    setSecret(totpSecretOf(result.totpURI))
    setStep("scan")
  })
  const confirm = useAction(async (code: string) => {
    await onConfirm(code)
    setStep("codes")
  })
  const passwordForm = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      await password.call(value.password)
    },
  })
  const codeForm = useForm({
    defaultValues: { code: "" },
    validators: { onSubmit: codeSchema },
    onSubmit: async ({ value }) => {
      await confirm.call(value.code.trim())
    },
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {step === "password" ? (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void passwordForm.handleSubmit()
            }}
          >
            <DialogHeader>
              <DialogTitle>Turn on two-factor</DialogTitle>
              <DialogDescription>Confirm your password to start.</DialogDescription>
            </DialogHeader>
            <passwordForm.Field name="password">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={passwordId}>Password</FieldLabel>
                  <Input
                    id={passwordId}
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0 || undefined}
                    required
                  />
                  <FieldErrorLine errors={field.state.meta.errors} />
                </Field>
              )}
            </passwordForm.Field>
            <ErrorLine message={password.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={password.busy}>
                {password.busy ? "Checking…" : "Continue"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {step === "scan" && setup ? (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void codeForm.handleSubmit()
            }}
          >
            <DialogHeader>
              <DialogTitle>Add to your authenticator app</DialogTitle>
              <DialogDescription>
                Scanning a QR code isn't available here yet. Add a new account in your app and enter
                the setup key, or open the setup link on this device.
              </DialogDescription>
            </DialogHeader>
            <CopyField label="Setup key" value={secret} />
            <CopyField label="Setup link" value={setup.totpURI} />
            <codeForm.Field name="code">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={codeId}>Six-digit code from the app</FieldLabel>
                  <Input
                    id={codeId}
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0 || undefined}
                    required
                  />
                  <FieldDescription>Enter the code the app shows now.</FieldDescription>
                  <FieldErrorLine errors={field.state.meta.errors} />
                </Field>
              )}
            </codeForm.Field>
            <ErrorLine message={confirm.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={confirm.busy}>
                {confirm.busy ? "Checking…" : "Turn on"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {step === "codes" && setup ? (
          <BackupCodesView
            title="Save your backup codes"
            description="Each code works once if you lose your device. We won't show these again."
            codes={setup.backupCodes}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function TurnOffDialog({
  open,
  onOpenChange,
  onDisable,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDisable: (password: string) => Promise<void>
}) {
  const passwordId = useId()
  const action = useAction(async (value: string) => {
    await onDisable(value)
  })
  const form = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      if (await action.call(value.password)) onOpenChange(false)
    },
  })
  // Once closed (after the exit animation), the dialog forgets what was typed and any error.
  const forget = () => {
    action.setError(null)
    form.reset()
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        if (!next) forget()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Turn off two-factor?</AlertDialogTitle>
          <AlertDialogDescription>
            Signing in with a password will need only the password. Your backup codes stop working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <form.Field name="password">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={passwordId}>Password</FieldLabel>
                <Input
                  id={passwordId}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  required
                />
                <FieldErrorLine errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <ErrorLine message={action.error} />
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={action.busy}>
              {action.busy ? "Turning off…" : "Turn off two-factor"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function NewCodesDialog({
  open,
  onOpenChange,
  onNewCodes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNewCodes: (password: string) => Promise<string[]>
}) {
  const passwordId = useId()
  const [codes, setCodes] = useState<string[] | null>(null)
  const action = useAction(async (value: string) => {
    setCodes(await onNewCodes(value))
  })
  const form = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      await action.call(value.password)
    },
  })
  // Once closed (after the exit animation), the codes and what was typed are forgotten: reopening
  // asks for the password again.
  const forget = () => {
    setCodes(null)
    action.setError(null)
    form.reset()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        if (!next) forget()
      }}
    >
      <DialogContent>
        {codes ? (
          <BackupCodesView
            title="Your new backup codes"
            description="The old codes no longer work. Save these now; we won't show them again."
            codes={codes}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <DialogHeader>
              <DialogTitle>Make new backup codes</DialogTitle>
              <DialogDescription>
                Confirm your password. The old codes stop working.
              </DialogDescription>
            </DialogHeader>
            <form.Field name="password">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={passwordId}>Password</FieldLabel>
                  <Input
                    id={passwordId}
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0 || undefined}
                    required
                  />
                  <FieldErrorLine errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <ErrorLine message={action.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={action.busy}>
                {action.busy ? "Making codes…" : "Make new codes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function BackupCodesView({
  title,
  description,
  codes,
  onDone,
}: {
  title: string
  description: string
  codes: string[]
  onDone: () => void
}) {
  const text = codes.join("\n")
  const [copied, setCopied] = useState(false)
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <ul aria-label="Backup codes" className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((code) => (
          <li key={code} className="rounded-md border border-border px-2 py-1.5">
            {code}
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopied(true)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Button onClick={onDone}>I've saved them</Button>
      </DialogFooter>
    </>
  )
}

// ---- Password -------------------------------------------------------------------------------------

export interface PasswordSectionProps {
  hasPassword: boolean
  changedAt: string | Date | null
  onChange: (input: { currentPassword: string; newPassword: string }) => Promise<void>
}

export function PasswordSection({ hasPassword, changedAt, onChange }: PasswordSectionProps) {
  const headingId = useId()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const changed = relativeTime(changedAt)
  return (
    <section aria-labelledby={headingId} className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 id={headingId} className="text-base font-bold">
          Password
        </h2>
        <span className="text-[13.5px] text-muted-foreground">
          {hasPassword
            ? `${changed ? `Changed ${changed}` : "Set"} · checked against Have I Been Pwned when you change it`
            : "No password on this account. Use Forgot password on the sign-in page to set one."}
        </span>
        {done ? (
          <output className="text-sm text-muted-foreground">Your password is changed.</output>
        ) : null}
      </div>
      <Button variant="outline" disabled={!hasPassword} onClick={() => setOpen(true)}>
        Change password
      </Button>
      <ChangePasswordDialog
        open={open}
        onOpenChange={(next) => {
          // Opening clears the last note. Closing after a change keeps it on the page.
          if (next) setDone(false)
          setOpen(next)
        }}
        onChange={async (input) => {
          await onChange(input)
          setDone(true)
        }}
      />
    </section>
  )
}

/** The new password must be 8+ characters and match its confirmation. */
const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(8, "The new password must be at least 8 characters long."),
    confirm: z.string(),
  })
  .refine((value) => value.next === value.confirm, {
    message: "The two passwords do not match.",
    path: ["confirm"],
  })

function ChangePasswordDialog({
  open,
  onOpenChange,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (input: { currentPassword: string; newPassword: string }) => Promise<void>
}) {
  const currentId = useId()
  const newId = useId()
  const confirmId = useId()
  const action = useAction(async (input: { currentPassword: string; newPassword: string }) => {
    await onChange(input)
  })
  const form = useForm({
    defaultValues: { current: "", next: "", confirm: "" },
    validators: { onSubmit: changePasswordSchema },
    onSubmit: async ({ value }) => {
      if (await action.call({ currentPassword: value.current, newPassword: value.next })) {
        onOpenChange(false)
      }
    },
  })
  // Once closed (after the exit animation), the dialog forgets what was typed and any error.
  const forget = () => {
    action.setError(null)
    form.reset()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        if (!next) forget()
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Checked against Have I Been Pwned. A password found in a known breach is refused.
            </DialogDescription>
          </DialogHeader>
          <form.Field name="current">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={currentId}>Current password</FieldLabel>
                <Input
                  id={currentId}
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  required
                />
                <FieldErrorLine errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="next">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={newId}>New password</FieldLabel>
                <Input
                  id={newId}
                  name="next"
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  minLength={8}
                  required
                />
                <FieldDescription>Use at least 8 characters.</FieldDescription>
                <FieldErrorLine errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="confirm">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={confirmId}>Confirm new password</FieldLabel>
                <Input
                  id={confirmId}
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  required
                />
                <FieldErrorLine errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <ErrorLine message={action.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={action.busy}>
              {action.busy ? "Changing…" : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---- Connected accounts ---------------------------------------------------------------------------

export interface ConnectedRow {
  accountId: string | null
  provider: string
  label: string
  connectedAt: string | Date | null
}

export interface ConnectedAccountsSectionProps {
  rows: ConnectedRow[]
  /** The person connects a provider they are not signed in with yet. */
  onConnect: (provider: string) => Promise<void>
  onDisconnect: (accountId: string) => Promise<void>
}

export function ConnectedAccountsSection({
  rows,
  onConnect,
  onDisconnect,
}: ConnectedAccountsSectionProps) {
  const headingId = useId()
  const [error, setError] = useState<string | null>(null)
  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <div className="mb-1.5 flex flex-col">
        <h2 id={headingId} className="text-base font-bold">
          Connected accounts
        </h2>
        <span className="text-[13.5px] text-muted-foreground">
          Sign in with these instead of a password. You can't disconnect your last way to sign in.
        </span>
      </div>
      <ErrorLine message={error} />
      {rows.map((row, index) => (
        <ConnectedRowView
          key={row.provider}
          row={row}
          last={index === rows.length - 1}
          onConnect={async () => {
            setError(null)
            try {
              await onConnect(row.provider)
            } catch (caught) {
              setError(accountErrorMessage(caught))
            }
          }}
          onDisconnect={async () => {
            if (!row.accountId) return
            setError(null)
            try {
              await onDisconnect(row.accountId)
            } catch (caught) {
              setError(accountErrorMessage(caught))
            }
          }}
        />
      ))}
    </section>
  )
}

function ConnectedRowView({
  row,
  last,
  onConnect,
  onDisconnect,
}: {
  row: ConnectedRow
  last: boolean
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const connected = row.accountId !== null
  return (
    <div className={last ? ROW_LAST : ROW}>
      <div className={TEXT}>
        <span className="font-semibold">{row.label}</span>
        <span className={META}>
          {connected
            ? `Connected${row.connectedAt ? ` · ${dateLabel(row.connectedAt)}` : ""}`
            : "Not connected"}
        </span>
      </div>
      {connected ? (
        <Button variant="outline" onClick={() => setConfirming(true)}>
          Disconnect
        </Button>
      ) : (
        <Button
          variant="default"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConnect()
            } finally {
              setBusy(false)
            }
          }}
        >
          Connect
        </Button>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {row.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't be able to sign in with {row.label} any more. You can connect it again
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onDisconnect()
                  setConfirming(false)
                } finally {
                  setBusy(false)
                }
              }}
            >
              Disconnect {row.label}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---- Sessions -------------------------------------------------------------------------------------

export interface SessionRow {
  token: string
  device: string
  method: string | null
  when: string
  current: boolean
}

export interface SessionsSectionProps {
  sessions: SessionRow[]
  /** The list needs a recent sign-in before it can be read. */
  needsSignIn: boolean
  signInHref: string
  onRevoke: (token: string) => Promise<void>
  onRevokeOthers: () => Promise<void>
  renderLink: RenderLink
}

export function SessionsSection({
  sessions,
  needsSignIn,
  signInHref,
  onRevoke,
  onRevokeOthers,
  renderLink,
}: SessionsSectionProps) {
  const headingId = useId()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The session being signed out: its button waits, so a second click doesn't send a second revoke.
  const [revoking, setRevoking] = useState<string | null>(null)
  const revokingRef = useRef<string | null>(null)
  const others = sessions.filter((session) => !session.current)
  const revoke = async (token: string) => {
    if (revokingRef.current !== null) return
    revokingRef.current = token
    setRevoking(token)
    setError(null)
    try {
      await onRevoke(token)
    } catch (caught) {
      setError(accountErrorMessage(caught))
    } finally {
      revokingRef.current = null
      setRevoking(null)
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <div className="mb-1.5 flex flex-wrap items-center gap-3">
        <h2 id={headingId} className="flex-1 text-base font-bold">
          Where you're signed in
        </h2>
        {others.length > 0 ? (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Sign out everywhere else
          </Button>
        ) : null}
      </div>
      <ErrorLine message={error} />
      {needsSignIn ? (
        <p className="border-t border-border py-2.5 text-sm">
          Sign in again to see your sessions. Listing them needs a recent sign-in.{" "}
          {renderLink({
            href: signInHref,
            className: "underline underline-offset-4",
            children: "Sign in again",
          })}
        </p>
      ) : null}
      {sessions.map((session) => (
        <div key={session.token} className={ROW}>
          <div className={TEXT}>
            <span className="font-semibold">
              {session.device}
              {session.current ? (
                <span className="ml-1.5 rounded bg-solar px-1.5 text-xs font-extrabold text-solar-foreground">
                  This device
                </span>
              ) : null}
            </span>
            <span className={META}>
              {session.method ? `Signed in with ${session.method}` : "Signed in"} · {session.when}
            </span>
          </div>
          {session.current ? null : (
            <Button
              variant="outline"
              aria-label={`Sign out ${session.device}`}
              disabled={revoking === session.token}
              onClick={() => void revoke(session.token)}
            >
              Sign out
            </Button>
          )}
        </div>
      ))}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out everywhere else?</AlertDialogTitle>
            <AlertDialogDescription>
              This signs out {others.length} other {others.length === 1 ? "session" : "sessions"},
              including any on other devices. This one stays signed in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await onRevokeOthers()
                  setConfirming(false)
                } catch (caught) {
                  setError(accountErrorMessage(caught))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Sign out others
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
