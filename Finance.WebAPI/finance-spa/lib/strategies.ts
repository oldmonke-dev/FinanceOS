import {
  type BayesianStatisticsExport,
  type BayesianStrategy,
  type BayesianTrainingExample,
  type ImportBayesianStatisticsResult,
  type ImportBayesianTrainingResult,
} from "@/models/strategy"
import { authFetch } from "@/lib/auth"
import { API_BASE_URL } from "@/lib/api-config"

export async function getBayesianStrategy(): Promise<BayesianStrategy> {
  const response = await authFetch(`${API_BASE_URL}/Strategies/bayesian`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch strategy data: ${response.status} ${response.statusText}`)
  }

  const raw = (await response.json()) as Record<string, unknown>
  const mapGroupsSource = raw.mapGroups ?? raw.MapGroups

  return {
    strategyKey: String(raw.strategyKey ?? raw.StrategyKey ?? "bayesian_statistics"),
    learnedFeatureCount: Number(raw.learnedFeatureCount ?? raw.LearnedFeatureCount ?? 0),
    learnedAccountCount: Number(raw.learnedAccountCount ?? raw.LearnedAccountCount ?? 0),
    mapGroups: Array.isArray(mapGroupsSource)
      ? mapGroupsSource.map((group) => {
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
            destinationAccountOwnerUserId:
              item.destinationAccountOwnerUserId == null &&
              item.DestinationAccountOwnerUserId == null
                ? null
                : String(
                    item.destinationAccountOwnerUserId ??
                      item.DestinationAccountOwnerUserId,
                  ),
            destinationAccountOwnerDisplayName:
              item.destinationAccountOwnerDisplayName == null &&
              item.DestinationAccountOwnerDisplayName == null
                ? null
                : String(
                    item.destinationAccountOwnerDisplayName ??
                      item.DestinationAccountOwnerDisplayName,
                  ),
            destinationAccountOwnerEmail:
              item.destinationAccountOwnerEmail == null &&
              item.DestinationAccountOwnerEmail == null
                ? null
                : String(
                    item.destinationAccountOwnerEmail ??
                      item.DestinationAccountOwnerEmail,
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

export async function exportBayesianStatistics(): Promise<BayesianStatisticsExport> {
  const response = await authFetch(`${API_BASE_URL}/Strategies/bayesian/export`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to export Bayesian statistics: ${response.status} ${response.statusText}`)
  }

  const raw = (await response.json()) as Record<string, unknown>
  const entries = raw.entries ?? raw.Entries

  return {
    format: "finance.bayesian_statistics",
    version: 1,
    exportedAt: String(raw.exportedAt ?? raw.ExportedAt ?? new Date().toISOString()),
    entries: Array.isArray(entries)
      ? entries.map((entry) => {
          const item = entry as Record<string, unknown>
          return {
            destinationAccountPath: String(
              item.destinationAccountPath ?? item.DestinationAccountPath ?? "",
            ),
            destinationAccountOwnerUserId:
              item.destinationAccountOwnerUserId == null &&
              item.DestinationAccountOwnerUserId == null
                ? null
                : String(
                    item.destinationAccountOwnerUserId ??
                      item.DestinationAccountOwnerUserId,
                  ),
            featureKey: String(item.featureKey ?? item.FeatureKey ?? ""),
            count: Number(item.count ?? item.Count ?? 0),
          }
        })
      : [],
  }
}

export async function importBayesianTrainingData(
  examples: BayesianTrainingExample[],
): Promise<ImportBayesianTrainingResult> {
  const response = await authFetch(`${API_BASE_URL}/Strategies/bayesian/import-training`, {
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

export async function importBayesianStatistics(
  payload: BayesianStatisticsExport,
): Promise<ImportBayesianStatisticsResult> {
  const response = await authFetch(`${API_BASE_URL}/Strategies/bayesian/import-statistics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Failed to import Bayesian statistics: ${response.status} ${response.statusText}`)
  }

  const raw = (await response.json()) as Record<string, unknown>
  const missingAccountPaths = raw.missingAccountPaths ?? raw.MissingAccountPaths

  return {
    importedEntryCount: Number(raw.importedEntryCount ?? raw.ImportedEntryCount ?? 0),
    skippedEntryCount: Number(raw.skippedEntryCount ?? raw.SkippedEntryCount ?? 0),
    missingAccountPaths: Array.isArray(missingAccountPaths)
      ? missingAccountPaths.map((value) => String(value ?? ""))
      : [],
  }
}

export async function deleteBayesianLearningForAccount(destinationAccountId: string): Promise<void> {
  const response = await authFetch(
    `${API_BASE_URL}/Strategies/bayesian/accounts/${destinationAccountId}/learning`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    },
  )

  if (!response.ok) {
    let message = `Failed to delete account learning: ${response.status} ${response.statusText}`

    try {
      const raw = (await response.json()) as { message?: string }
      message = raw.message ?? message
    } catch {}

    throw new Error(message)
  }
}
