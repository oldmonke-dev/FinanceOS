import { BayesianTrainingImportPanel } from "@/components/bayesian-training-import-panel"
import { BayesianMapGroups } from "@/components/bayesian-map-groups"
import { AppShell } from "@/components/app-shell"
import { getBayesianStrategy } from "@/lib/strategies"

export default async function BayesianStrategyPage() {
  const strategy = await getBayesianStrategy()

  return (
    <AppShell
      title="Bayesian Strategy"
      subtitle="DB-backed map editor for learned mappings"
      badge={`${strategy.learnedAccountCount} learned accounts`}
    >
      <BayesianTrainingImportPanel />

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Strategy</p>
          <p className="mt-2 text-sm font-semibold">{strategy.strategyKey}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Features</p>
          <p className="mt-2 text-sm font-semibold">{strategy.learnedFeatureCount}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Accounts</p>
          <p className="mt-2 text-sm font-semibold">{strategy.learnedAccountCount}</p>
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

        {strategy.mapGroups.length === 0 ? (
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
