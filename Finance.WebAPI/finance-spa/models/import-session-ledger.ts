export type AddImportSessionToLedgerResult = {
  sessionId: string
  createdTransactionCount: number
  skippedRowCount: number
  transactionIds: string[]
  sessionArchived: boolean
  sessionStatus: string
}
