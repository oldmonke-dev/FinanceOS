"use client"

import Link from "next/link"
import {
  ArrowRight,
  BrainCircuit,
  FileSpreadsheet,
  FileText,
  FolderTree,
  Receipt,
  TableOfContents,
  Workflow,
} from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"

const cards = [
  {
    title: "Accounts",
    description: "Browse the chart of accounts directly from the API.",
    href: "/accounts",
    icon: FolderTree,
  },
  {
    title: "Transactions",
    description: "Create balanced transactions using split lines.",
    href: "/transactions",
    icon: Receipt,
  },
  {
    title: "CSV Imports",
    description: "Prototype column mapping and filtering, then create import sessions.",
    href: "/import",
    icon: FileSpreadsheet,
  },
  {
    title: "Import Sessions",
    description: "Review the frontend-only sessions created from importer selections.",
    href: "/import-sessions",
    icon: TableOfContents,
  },
  {
    title: "PDF Imports",
    description: "Mock placeholder page while PDF extraction remains disabled.",
    href: "/import/pdf",
    icon: FileText,
  },
  {
    title: "Strategies",
    description: "Select a strategy page and open the DB-backed Bayesian map editor.",
    href: "/strategies",
    icon: BrainCircuit,
  },
]

export default function Page() {
  const { accounts, errorMessage } = useAccounts()
  const accountsCount = accounts.length

  return (
    <AppShell
      title="Ledger workspace"
      subtitle="ASP.NET API + split-based bookkeeping"
      badge={errorMessage ? "Backend unavailable" : `${accountsCount} accounts loaded`}
    >
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <article className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <Workflow className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Current backend model</h2>
              <p className="text-sm text-muted-foreground">
                Transactions contain split lines. Each split posts an amount to one
                account, and the full transaction must balance to zero.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Header</p>
              <p className="mt-2 font-medium">Transaction</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Date, description, reference number
              </p>
            </div>
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Postings</p>
              <p className="mt-2 font-medium">Splits</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Account id, amount, optional memo
              </p>
            </div>
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Constraint</p>
              <p className="mt-2 font-medium">Balanced total</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Split amounts must sum to exactly zero
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Backend status</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {errorMessage
              ? "The account endpoint could not be reached."
              : "The account endpoint is responding."}
          </p>
          <div className="mt-6 rounded-2xl border bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">Accounts discovered</p>
            <p className="mt-2 text-3xl font-semibold">
              {errorMessage ? "--" : accountsCount}
            </p>
          </div>
          {errorMessage ? (
            <p className="mt-4 text-sm text-destructive">{errorMessage}</p>
          ) : null}
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group rounded-3xl border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:bg-background"
          >
            <div className="flex items-center justify-between">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <card.icon className="size-5" />
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
            </div>
            <h2 className="mt-6 text-xl font-semibold">{card.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
          </Link>
        ))}
      </section>
    </AppShell>
  )
}
