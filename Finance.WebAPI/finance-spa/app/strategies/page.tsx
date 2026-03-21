import Link from "next/link"
import { ArrowRight, BrainCircuit } from "lucide-react"

import { AppShell } from "@/components/app-shell"

const strategies = [
  {
    title: "Bayesian Strategy",
    href: "/strategies/bayesian",
    description:
      "View the actual DB-backed mapping editor for learned destination mappings and feature weights.",
    icon: BrainCircuit,
  },
]

export default function StrategiesPage() {
  return (
    <AppShell
      title="Strategies"
      subtitle="Select a strategy editor"
      badge="1 strategy"
    >
      <section className="max-w-5xl space-y-4">
        <div className="rounded-3xl border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Strategy Pages</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Each strategy has its own page. For now the Bayesian strategy is active and backed by
            the learning data stored in the database.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {strategies.map((strategy) => (
            <Link
              key={strategy.title}
              href={strategy.href}
              className="group rounded-3xl border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:bg-background"
            >
              <div className="flex items-center justify-between">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <strategy.icon className="size-5" />
                </div>
                <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
              </div>
              <h2 className="mt-6 text-xl font-semibold">{strategy.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{strategy.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  )
}
