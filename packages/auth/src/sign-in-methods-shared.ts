// The sign-in methods' shape, shared by the server endpoint and the browser client. No imports: it ships to browsers.

export type SocialProvider = "github" | "google"

export interface SignInMethods {
  password: boolean
  magicLink: boolean
  passkey: boolean
  social: SocialProvider[]
  /** SSO sign-in is by email domain: the page offers "Sign in with SSO" and asks for the address. */
  sso: boolean
  stripe: boolean
}
