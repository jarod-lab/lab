import type { ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@starter/ui/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@starter/ui/components/ui/card"

/** The centred card every page sits in: one heading, the page body, and optional footer links. */
export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string
  description?: string
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-xl leading-none font-semibold">{title}</h1>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer ? (
          <CardFooter className="flex-col items-start gap-2 text-sm">{footer}</CardFooter>
        ) : null}
      </Card>
    </main>
  )
}

/** A failure the person can act on. Renders nothing without a message. */
export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
