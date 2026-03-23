"use client"

import { FormEvent, useState } from "react"
import { ShieldCheck } from "lucide-react"

import { useAuth } from "@/components/providers/auth-provider"

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState("root@finance.local")
  const [password, setPassword] = useState("root")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await login(email, password)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to sign in.")
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Finance OS
            </p>
            <h1 className="text-2xl font-semibold">Sign in</h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Authentication is now required before loading accounts, transactions, imports, and strategies.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary"
              autoComplete="username"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary"
              autoComplete="current-password"
            />
          </label>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  )
}
