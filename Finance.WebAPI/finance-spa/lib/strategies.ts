import {
  type BayesianStrategy,
  type BayesianTrainingExample,
  type ImportBayesianTrainingResult,
} from "@/models/strategy"

const API_BASE_URL =
  process.env.FINANCE_API_BASE_URL ??
  process.env.NEXT_PUBLIC_FINANCE_API_BASE_URL ??
  "http://localhost:5132"

export async function getBayesianStrategy(): Promise<BayesianStrategy> {
  const response = await fetch(`${API_BASE_URL}/Strategies/bayesian`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch strategy data: ${response.status} ${response.statusText}`)
  }

  const raw = (await response.json()) as Record<string, unknown>

  return {
    strategyKey: String(raw.strategyKey ?? raw.StrategyKey ?? "bayesian_statistics"),
    learnedFeatureCount: Number(raw.learnedFeatureCount ?? raw.LearnedFeatureCount ?? 0),
    learnedAccountCount: Number(raw.learnedAccountCount ?? raw.LearnedAccountCount ?? 0),
    mapGroups: Array.isArray(raw.mapGroups ?? raw.MapGroups)
      ? (raw.mapGroups ?? raw.MapGroups as unknown[]).map((group) => {
          const item = group as Record<string, unknown>
          const entries = item.entries ?? item.Entries

          return {
            destinationAccountId: String(
              item.destinationAccountId ?? item.DestinationAccountId ?? "",
            ),
            destinationAccountName: String(
              item.destinationAccountName ?? item.DestinationAccountName ?? "",
            ),
            destinationAccountPath: String(
              item.destinationAccountPath ?? item.DestinationAccountPath ?? "",
            ),
            totalLearnedCount: Number(
              item.totalLearnedCount ?? item.TotalLearnedCount ?? 0,
            ),
            entries: Array.isArray(entries)
              ? entries.map((entry) => {
                  const value = entry as Record<string, unknown>
                  return {
                    featureKey: String(value.featureKey ?? value.FeatureKey ?? ""),
                    count: Number(value.count ?? value.Count ?? 0),
                  }
                })
              : [],
          }
        })
      : [],
  }
}

export async function importBayesianTrainingData(
  examples: BayesianTrainingExample[],
): Promise<ImportBayesianTrainingResult> {
  const response = await fetch(`${API_BASE_URL}/Strategies/bayesian/import-training`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ examples }),
  })

  if (!response.ok) {
    throw new Error(`Failed to import training data: ${response.status} ${response.statusText}`)
  }

  const raw = (await response.json()) as Record<string, unknown>
  const missingAccountPaths = raw.missingAccountPaths ?? raw.MissingAccountPaths

  return {
    importedExampleCount: Number(raw.importedExampleCount ?? raw.ImportedExampleCount ?? 0),
    skippedExampleCount: Number(raw.skippedExampleCount ?? raw.SkippedExampleCount ?? 0),
    missingAccountPaths: Array.isArray(missingAccountPaths)
      ? missingAccountPaths.map((value) => String(value ?? ""))
      : [],
  }
}
