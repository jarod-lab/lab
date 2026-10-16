import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/account/")({
  component: AccountHome,
})

function AccountHome() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <p className="mt-2 text-muted-foreground">
        [PLACEHOLDER] Profile and security pages come next.
      </p>
    </div>
  )
}
