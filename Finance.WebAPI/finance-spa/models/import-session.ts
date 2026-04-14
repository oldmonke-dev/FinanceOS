export type ImportSessionRow = {
  id: string
  rowIndex: number
  values: string[]
  destinationAccountId: string | null
  destinationAccountError: string | null
  mappingSource: string
  learningConfidenceScore: number | null
  addedToLedgerAt: string | null
  postedTransactionId: string | null
  projectBalance: number
}

export type ImportSession = {
  id: string
  createdAt: string
  createdByUserId: string
  createdByUserName: string
  fileName: string | null
  sourceAccountId: string | null
  sourceAccountName: string | null
  label: "user_imports" | "user_import_chunked" | "account_deletion_sessions" | string
  isDeletable: boolean
  strategy: string
  isArchived: boolean
  status: string
  columnMappings: Record<number, string>
  rows: ImportSessionRow[]
}

export type CreateImportSessionRowInput = {
  rowIndex: number
  values: string[]
  destinationAccountId: string | null
  destinationAccountError: string | null
  addedToLedgerAt?: string | null
  postedTransactionId?: string | null
}

export type CreateImportSessionInput = {
  fileName: string | null
  sourceAccountId: string | null
  label?: "user_imports" | "user_import_chunked" | "account_deletion_sessions" | string
  strategy?: string
  isArchived?: boolean
  status?: string
  columnMappings: Record<number, string>
  rows: CreateImportSessionRowInput[]
}
