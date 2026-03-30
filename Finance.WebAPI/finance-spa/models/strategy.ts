export type BayesianMapEntry = {
  featureKey: string
  count: number
}

export type BayesianMapGroup = {
  destinationAccountId: string
  destinationAccountName: string
  destinationAccountPath: string
  destinationAccountOwnerUserId: string | null
  destinationAccountOwnerDisplayName: string | null
  destinationAccountOwnerEmail: string | null
  totalLearnedCount: number
  entries: BayesianMapEntry[]
}

export type BayesianStrategy = {
  strategyKey: string
  learnedFeatureCount: number
  learnedAccountCount: number
  mapGroups: BayesianMapGroup[]
}

export type BayesianTrainingExample = {
  sourceAccountPath: string
  destinationAccountPath: string
  description: string | null
  reference: string | null
  memo: string | null
  amount: number | null
}

export type ImportBayesianTrainingResult = {
  importedExampleCount: number
  skippedExampleCount: number
  missingAccountPaths: string[]
}

export type BayesianStatisticsExportEntry = {
  destinationAccountPath: string
  destinationAccountOwnerUserId: string | null
  featureKey: string
  count: number
}

export type BayesianStatisticsExport = {
  format: "finance.bayesian_statistics"
  version: 1
  exportedAt: string
  entries: BayesianStatisticsExportEntry[]
}

export type ImportBayesianStatisticsResult = {
  importedEntryCount: number
  skippedEntryCount: number
  missingAccountPaths: string[]
}
