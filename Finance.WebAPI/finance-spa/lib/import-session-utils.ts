import { getSignedSplitAmount } from "@/lib/accounting"
import { type ImportSession, type ImportSessionRow } from "@/models/import-session"
import { type Transaction } from "@/models/transaction"

export type StrategyMode =
  | "unassigned"
  | "bayesian_statistics"
  | "nearest_neighbor"
  | "text_similarity"
  | "frequency_pattern"
  | "hybrid_ensemble"

export type ResolvedSessionRow = {
  sessionId: string
  sessionTitle: string
  rowId: string
  rowIndex: number
  dateKey: string | null
  description: string
  reference: string
  amount: number | null
  sourceAccountId: string | null
  destinationAccountId: string | null
}

export type ResolvedLedgerTransaction = {
  transactionId: string
  dateKey: string | null
  description: string
  reference: string
  amount: number | null
  sourceAccountId: string | null
  destinationAccountId: string | null
}

export function getSessionTitle(fileName: string | null) {
  return fileName ?? "Untitled import session"
}

export function formatAccountDisplayLabel(accountType: string, accountPath: string) {
  if (!accountPath) {
    return accountType
  }

  return `${accountType} / ${accountPath}`
}

export function formatImportSessionLabel(label: string) {
  if (label === "user_imports") {
    return "User Imports"
  }

  if (label === "user_import_chunked") {
    return "User Import Chunked"
  }

  if (label === "account_deletion_sessions") {
    return "Sessions made from deletion of accounts"
  }

  return label
}

export function formatMappingSource(mappingSource: string) {
  if (mappingSource === "manual") {
    return "Manual"
  }

  if (mappingSource === "learning") {
    return "Learning"
  }

  if (mappingSource === "seeded") {
    return "Seeded"
  }

  return "Unmapped"
}

export function formatConfidenceScore(value: number) {
  return value.toFixed(3)
}

export function normalizeDescriptionValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export function isUserImportSession(label: string | null | undefined) {
  return label === "user_imports" || label === "user_import_chunked"
}

export function normalizeStrategyMode(value: string | null | undefined): StrategyMode {
  switch (value) {
    case "bayesian_statistics":
    case "nearest_neighbor":
    case "text_similarity":
    case "frequency_pattern":
    case "hybrid_ensemble":
    case "unassigned":
      return value
    default:
      return "unassigned"
  }
}

export function resolveStrategyMode(session: ImportSession | null): StrategyMode {
  if (!session) {
    return "unassigned"
  }

  if (isUserImportSession(session.label)) {
    return "unassigned"
  }

  return normalizeStrategyMode(session.strategy)
}

export function formatStrategyLabel(strategy: StrategyMode) {
  switch (strategy) {
    case "bayesian_statistics":
      return "Bayesian Statistics"
    case "nearest_neighbor":
      return "Nearest Neighbor"
    case "text_similarity":
      return "Text Similarity"
    case "frequency_pattern":
      return "Frequency Pattern"
    case "hybrid_ensemble":
      return "Hybrid Ensemble"
    default:
      return "Unassigned"
  }
}

export function getSessionCardTitle(fileName: string | null) {
  const title = getSessionTitle(fileName)

  if (title.length <= 28) {
    return title
  }

  return `${title.slice(0, 28)}...`
}

export function getColumnLabel(
  columnMappings: Record<number, string>,
  valueIndex: number,
) {
  const mappedValue = columnMappings[valueIndex]

  if (!mappedValue || mappedValue === "unmapped") {
    return `Column ${valueIndex + 1}`
  }

  return mappedValue
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function resolveSessionRow(
  session: ImportSession,
  row: ImportSessionRow,
): ResolvedSessionRow | null {
  const sourceAccountId = session.sourceAccountId
  const destinationAccountId = row.destinationAccountId

  if (!sourceAccountId && !destinationAccountId) {
    return null
  }

  return {
    sessionId: session.id,
    sessionTitle: getSessionTitle(session.fileName),
    rowId: row.id,
    rowIndex: row.rowIndex,
    dateKey: resolveMappedDateKey(row.values, session.columnMappings),
    description: resolveMappedText(row.values, session.columnMappings, "description"),
    reference: resolveMappedText(row.values, session.columnMappings, "reference"),
    amount: resolveMappedAmount(row.values, session.columnMappings),
    sourceAccountId,
    destinationAccountId,
  }
}

export function resolveLedgerTransaction(transaction: Transaction): ResolvedLedgerTransaction | null {
  const splits = transaction.splits
  if (splits.length < 2) {
    return null
  }

  const sourceSplit =
    splits.find((split) => split.side === "debit") ??
    splits.reduce(
      (current, split) =>
        getSignedSplitAmount(split) < getSignedSplitAmount(current) ? split : current,
      splits[0],
    )
  const destinationSplit =
    splits.find((split) => split.side === "credit") ?? splits.find((split) => split.id !== sourceSplit.id) ?? null

  return {
    transactionId: transaction.id,
    dateKey: normalizeDateKey(transaction.transactionDate),
    description: transaction.description.trim().toLowerCase(),
    reference: (transaction.referenceNumber ?? "").trim().toLowerCase(),
    amount: sourceSplit ? getSignedSplitAmount(sourceSplit) : null,
    sourceAccountId: sourceSplit?.accountId ?? null,
    destinationAccountId: destinationSplit?.accountId ?? null,
  }
}

export function resolveMappedText(
  values: string[],
  columnMappings: Record<number, string>,
  fieldName: string,
) {
  const columnIndex = findMappedColumnIndex(columnMappings, fieldName)
  if (columnIndex == null || columnIndex < 0 || columnIndex >= values.length) {
    return ""
  }

  return String(values[columnIndex] ?? "").trim().toLowerCase()
}

export function resolveMappedDateKey(values: string[], columnMappings: Record<number, string>) {
  const rawDate = resolveMappedText(values, columnMappings, "date")
  if (!rawDate) {
    return null
  }

  return normalizeDateKey(rawDate)
}

export function normalizeDateKey(rawDate: string) {
  const parsed = new Date(rawDate)
  if (Number.isNaN(parsed.getTime())) {
    return rawDate
  }

  return parsed.toISOString().slice(0, 10)
}

export function resolveMappedAmount(values: string[], columnMappings: Record<number, string>) {
  const deposit = resolveMappedNumber(values, columnMappings, "amount")
  const withdrawal = resolveMappedNumber(values, columnMappings, "amount_negate")

  if (deposit == null && withdrawal == null) {
    return null
  }

  if (deposit != null && withdrawal != null) {
    return deposit - Math.abs(withdrawal)
  }

  return deposit != null ? deposit : -Math.abs(withdrawal ?? 0)
}

export function resolveMappedNumber(
  values: string[],
  columnMappings: Record<number, string>,
  fieldName: string,
) {
  const columnIndex = findMappedColumnIndex(columnMappings, fieldName)
  if (columnIndex == null || columnIndex < 0 || columnIndex >= values.length) {
    return null
  }

  const rawValue = String(values[columnIndex] ?? "").trim()
  if (!rawValue) {
    return null
  }

  const normalized = rawValue.replace(/,/g, "")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function findMappedColumnIndex(
  columnMappings: Record<number, string>,
  fieldName: string,
) {
  const match = Object.entries(columnMappings).find(([, value]) => value === fieldName)
  return match ? Number(match[0]) : null
}

export function scoreResolvedRows(left: ResolvedSessionRow, right: ResolvedSessionRow) {
  const dateScore =
    left.dateKey && right.dateKey ? (left.dateKey === right.dateKey ? 1 : 0) : 0
  const descriptionScore = scoreTextSimilarity(left.description, right.description)
  const referenceScore = scoreTextSimilarity(left.reference, right.reference)
  const amountScore = scoreAmountSimilarity(left.amount, right.amount)

  return dateScore * 0.3 + descriptionScore * 0.35 + referenceScore * 0.15 + amountScore * 0.2
}

export function scoreLedgerMatch(left: ResolvedSessionRow, right: ResolvedLedgerTransaction) {
  const dateScore =
    left.dateKey && right.dateKey ? (left.dateKey === right.dateKey ? 1 : 0) : 0
  const descriptionScore = scoreTextSimilarity(left.description, right.description)
  const referenceScore = scoreTextSimilarity(left.reference, right.reference)
  const amountScore = scoreAmountSimilarity(left.amount, right.amount)

  return dateScore * 0.3 + descriptionScore * 0.35 + referenceScore * 0.15 + amountScore * 0.2
}

export function scoreTextSimilarity(left: string, right: string) {
  if (!left || !right) {
    return 0
  }

  if (left === right) {
    return 1
  }

  const leftTokens = new Set(left.split(/\s+/).filter(Boolean))
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean))
  const intersectionSize = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length
  const unionSize = new Set([...leftTokens, ...rightTokens]).size

  return unionSize === 0 ? 0 : intersectionSize / unionSize
}

export function scoreAmountSimilarity(left: number | null, right: number | null) {
  if (left == null || right == null) {
    return 0
  }

  const delta = Math.abs(left - right)
  const scale = Math.max(Math.abs(left), Math.abs(right), 1)
  return Math.max(0, 1 - delta / scale)
}
