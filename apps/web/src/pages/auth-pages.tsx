import { useState } from "react"

import { AuthCard } from "../components/auth-card"
import { type CredentialValues, CredentialsForm } from "../components/credentials-form"
import { messageOf } from "../lib/messages"
import { navigateTo } from "../lib/navigation"
import type { WebAuth } from "../lib/web-auth"

/**
 * Sign in. When an OAuth flow is pending the server answers with the URL to resume it (consent,
 * organization choice or the authorization itself); otherwise the page goes to `next`.
 */
export function SignInPage({
  auth,
  next,
  signUpHref,
}: {
  auth: WebAuth
  next: string
  signUpHref: string
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(values: CredentialValues) {
    setPending(true)
    setError(null)
    try {
      navigateTo((await auth.signIn({ email: values.email, password: values.password })) ?? next)
    } catch (caught) {
      setError(messageOf(caught))
      setPending(false)
    }
  }

  return (
    <AuthCard
      title="Sign in"
      description="Sign in to manage your organization and the agents connected to it."
      footer={
        <p>
          New here?{" "}
          <a href={signUpHref} className="underline underline-offset-4">
            Create an account
          </a>
        </p>
      }
    >
      <CredentialsForm
        mode="sign-in"
        pending={pending}
        error={error}
        submitLabel="Sign in"
        onSubmit={submit}
      />
    </AuthCard>
  )
}

/** Create an account. Signing up also signs the new user in and creates their personal organization. */
export function SignUpPage({
  auth,
  next,
  signInHref,
}: {
  auth: WebAuth
  next: string
  signInHref: string
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(values: CredentialValues) {
    setPending(true)
    setError(null)
    try {
      navigateTo(
        (await auth.signUp({
          name: values.name,
          email: values.email,
          password: values.password,
        })) ?? next,
      )
    } catch (caught) {
      setError(messageOf(caught))
      setPending(false)
    }
  }

  return (
    <AuthCard
      title="Create an account"
      description="You get a personal organization. You can invite others later."
      footer={
        <p>
          Already have an account?{" "}
          <a href={signInHref} className="underline underline-offset-4">
            Sign in
          </a>
        </p>
      }
    >
      <CredentialsForm
        mode="sign-up"
        pending={pending}
        error={error}
        submitLabel="Create account"
        onSubmit={submit}
      />
    </AuthCard>
  )
}
