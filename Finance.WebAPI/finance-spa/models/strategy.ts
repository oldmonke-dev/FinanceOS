export type BayesianMapEntry = {
  featureKey: string
  count: number
}

export type BayesianMapGroup = {
  destinationAccountId: string
  destinationAccountName: string
  destinationAccountPath: string
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
