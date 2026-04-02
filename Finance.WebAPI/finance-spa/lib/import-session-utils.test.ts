import type { ImportSession } from "@/models/import-session"
import type { Transaction } from "@/models/transaction"

import {
  formatConfidenceScore,
  formatImportSessionLabel,
  formatMappingSource,
  formatStrategyLabel,
  getColumnLabel,
  getSessionCardTitle,
  isUserImportSession,
  normalizeDescriptionValue,
  normalizeStrategyMode,
  resolveLedgerTransaction,
  resolveMappedAmount,
  resolveSessionRow,
  resolveStrategyMode,
  scoreAmountSimilarity,
  scoreTextSimilarity,
} from "./import-session-utils"

function createSession(overrides: Partial<ImportSession>): ImportSession {
  return {
    id: overrides.id ?? "session-1",
    createdAt: overrides.createdAt ?? "2026-04-01T00:00:00Z",
    createdByUserId: overrides.createdByUserId ?? "user-1",
    createdByUserName: overrides.createdByUserName ?? "Finance User",
    fileName: overrides.fileName ?? "statement.csv",
    sourceAccountId: overrides.sourceAccountId ?? "source-1",
    sourceAccountName: overrides.sourceAccountName ?? "Bank",
    label: overrides.label ?? "user_imports",
    isDeletable: overrides.isDeletable ?? true,
    strategy: overrides.strategy ?? "bayesian_statistics",
    isArchived: overrides.isArchived ?? false,
    status: overrides.status ?? "Active",
    columnMappings: overrides.columnMappings ?? { 0: "date", 1: "description", 2: "amount" },
    rows: overrides.rows ?? [],
  }
}

function createTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? "txn-1",
    transactionDate: overrides.transactionDate ?? "2026-03-31T00:00:00Z",
    description: overrides.description ?? "Coffee",
    referenceNumber: overrides.referenceNumber ?? "ABC",
    createdAt: overrides.createdAt ?? "2026-04-01T00:00:00Z",
    splits: overrides.splits ?? [
      { id: "split-1", accountId: "source-1", amount: 120, side: "debit", memo: null },
      { id: "split-2", accountId: "dest-1", amount: 120, side: "credit", memo: null },
    ],
  }
}

describe("import-session utils", () => {
  it("formats labels and strategy text", () => {
    expect(formatImportSessionLabel("user_imports")).toBe("User Imports")
    expect(formatMappingSource("learning")).toBe("Learning")
    expect(formatConfidenceScore(0.8734)).toBe("0.873")
    expect(formatStrategyLabel("bayesian_statistics")).toBe("Bayesian Statistics")
    expect(getSessionCardTitle("A very long import session title that should be shortened")).toContain("...")
  })

  it("normalizes session strategy and description text", () => {
    expect(isUserImportSession("user_import_chunked")).toBe(true)
    expect(normalizeStrategyMode("invalid")).toBe("unassigned")
    expect(resolveStrategyMode(createSession({ label: "user_imports", strategy: "nearest_neighbor" }))).toBe("unassigned")
    expect(resolveStrategyMode(createSession({ label: "other", strategy: "nearest_neighbor" }))).toBe("nearest_neighbor")
    expect(normalizeDescriptionValue("  Coffee   Shop  ")).toBe("coffee shop")
  })

  it("resolves mapped values and amounts from session rows", () => {
    const session = createSession({})
    const row = {
      id: "row-1",
      rowIndex: 0,
      values: ["2026-03-31", "Coffee", "120"],
      destinationAccountId: "dest-1",
      destinationAccountError: null,
      mappingSource: "learning",
      learningConfidenceScore: 0.9,
      addedToLedgerAt: null,
      postedTransactionId: null,
      projectBalance: 0,
    }

    const resolved = resolveSessionRow(session, row)

    expect(getColumnLabel(session.columnMappings, 1)).toBe("Description")
    expect(resolveMappedAmount(row.values, session.columnMappings)).toBe(120)
    expect(resolved?.description).toBe("coffee")
    expect(resolved?.destinationAccountId).toBe("dest-1")
  })

  it("resolves ledger transactions and similarity scores", () => {
    const transaction = createTransaction({})
    const resolved = resolveLedgerTransaction(transaction)

    expect(resolved?.sourceAccountId).toBe("source-1")
    expect(resolved?.destinationAccountId).toBe("dest-1")
    expect(scoreTextSimilarity("coffee shop", "coffee shop")).toBe(1)
    expect(scoreTextSimilarity("coffee shop", "tea house")).toBe(0)
    expect(scoreAmountSimilarity(100, 100)).toBe(1)
    expect(scoreAmountSimilarity(100, 50)).toBe(0.5)
  })
})
