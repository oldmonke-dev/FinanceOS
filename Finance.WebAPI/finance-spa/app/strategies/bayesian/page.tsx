"use client"

import { useEffect, useState } from "react"

import { BayesianTrainingImportPanel } from "@/components/bayesian-training-import-panel"
import { BayesianMapGroups } from "@/components/bayesian-map-groups"
import { AppShell } from "@/components/app-shell"
import { getBayesianStrategy } from "@/lib/strategies"
import { type BayesianStrategy } from "@/models/strategy"

export default function BayesianStrategyPage() {
  const [strategy, setStrategy] = useState<BayesianStrategy | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadStrategy() {
      try {
        const nextStrategy = await getBayesianStrategy()
        if (isMounted) {
          setStrategy(nextStrategy)
          setErrorMessage(null)
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load Bayesian strategy.",
          )
        }
      }
    }

    void loadStrategy()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <AppShell
      title="Bayesian Strategy"
      subtitle="DB-backed map editor for learned mappings"
      badge={strategy ? `${strategy.learnedAccountCount} learned accounts` : "Loading..."}
    >
      <BayesianTrainingImportPanel />

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Strategy</p>
          <p className="mt-2 text-sm font-semibold">{strategy?.strategyKey ?? "--"}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Features</p>
          <p className="mt-2 text-sm font-semibold">{strategy?.learnedFeatureCount ?? "--"}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Accounts</p>
          <p className="mt-2 text-sm font-semibold">{strategy?.learnedAccountCount ?? "--"}</p>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Map Editor</h2>
          <p className="text-xs text-muted-foreground">
            This view reads the Bayesian learning map directly from the database and groups learned
            features by destination account.
          </p>
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-dashed bg-background/70 p-8 text-center text-sm text-destructive">
            {errorMessage}
          </div>
        ) : !strategy ? (
          <div className="mt-4 rounded-2xl border border-dashed bg-background/70 p-8 text-center text-sm text-muted-foreground">
            Loading Bayesian learning data...
          </div>
        ) : strategy.mapGroups.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed bg-background/70 p-8 text-center text-sm text-muted-foreground">
            No Bayesian learning data has been written yet.
          </div>
        ) : (
          <BayesianMapGroups groups={strategy.mapGroups} />
        )}
      </section>
    </AppShell>
  )
}
