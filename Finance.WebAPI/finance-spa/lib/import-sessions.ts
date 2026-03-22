import {
  type AddImportSessionToLedgerResult,
} from "@/models/import-session-ledger"
import {
  type CreateImportSessionInput,
  type ImportSession,
  type ImportSessionRow,
} from "@/models/import-session"
import { API_BASE_URL } from "@/lib/api-config"

function normalizeImportSessionRow(raw: Record<string, unknown>): ImportSessionRow {
  const valuesSource = raw.values ?? raw.Values
  const values: unknown[] = Array.isArray(valuesSource) ? valuesSource : []

  return {
    id: String(raw.id ?? raw.Id ?? ""),
    rowIndex: Number(raw.rowIndex ?? raw.RowIndex ?? 0),
    values: values.map((value) => String(value ?? "")),
    destinationAccountId:
      raw.destinationAccountId == null && raw.DestinationAccountId == null
        ? null
        : String(raw.destinationAccountId ?? raw.DestinationAccountId),
    destinationAccountError:
      raw.destinationAccountError == null && raw.DestinationAccountError == null
        ? null
        : String(raw.destinationAccountError ?? raw.DestinationAccountError),
    mappingSource: String(raw.mappingSource ?? raw.MappingSource ?? "none"),
    addedToLedgerAt:
      raw.addedToLedgerAt == null && raw.AddedToLedgerAt == null
        ? null
        : String(raw.addedToLedgerAt ?? raw.AddedToLedgerAt),
    postedTransactionId:
      raw.postedTransactionId == null && raw.PostedTransactionId == null
        ? null
        : String(raw.postedTransactionId ?? raw.PostedTransactionId),
    projectBalance: Number(raw.projectBalance ?? raw.ProjectBalance ?? 0),
  }
}

function normalizeColumnMappings(raw: unknown): Record<number, string> {
  if (!raw || typeof raw !== "object") {
    return {}
  }

  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([key, value]) => [
      Number(key),
      String(value ?? ""),
    ]),
  )
}

function normalizeImportSession(raw: Record<string, unknown>): ImportSession {
  const rowsSource = raw.rows ?? raw.Rows
  const rows: unknown[] = Array.isArray(rowsSource) ? rowsSource : []

  return {
    id: String(raw.id ?? raw.Id ?? ""),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ""),
    createdByUserId: String(raw.userId ?? raw.UserId ?? ""),
    createdByUserName: String(raw.createdByUserName ?? raw.CreatedByUserName ?? "Root User"),
    fileName:
      raw.fileName == null && raw.FileName == null ? null : String(raw.fileName ?? raw.FileName),
    sourceAccountId:
      raw.sourceAccountId == null && raw.SourceAccountId == null
        ? null
        : String(raw.sourceAccountId ?? raw.SourceAccountId),
    sourceAccountName:
      raw.sourceAccountName == null && raw.SourceAccountName == null
        ? null
        : String(raw.sourceAccountName ?? raw.SourceAccountName),
    label: String(raw.label ?? raw.Label ?? "user_imports"),
    isDeletable: Boolean(raw.isDeletable ?? raw.IsDeletable ?? true),
    strategy: String(raw.strategy ?? raw.Strategy ?? "bayesian_statistics"),
    isArchived: Boolean(raw.isArchived ?? raw.IsArchived ?? false),
    status: String(raw.status ?? raw.Status ?? "Active"),
    columnMappings: normalizeColumnMappings(raw.columnMappings ?? raw.ColumnMappings),
    rows: rows.map((row) => normalizeImportSessionRow(row as Record<string, unknown>)),
  }
}

function normalizeAddImportSessionToLedgerResult(
  raw: Record<string, unknown>,
): AddImportSessionToLedgerResult {
  const transactionIdsSource = raw.transactionIds ?? raw.TransactionIds
  const transactionIds: unknown[] = Array.isArray(transactionIdsSource) ? transactionIdsSource : []

  return {
    sessionId: String(raw.sessionId ?? raw.SessionId ?? ""),
    createdTransactionCount: Number(
      raw.createdTransactionCount ?? raw.CreatedTransactionCount ?? 0,
    ),
    skippedRowCount: Number(raw.skippedRowCount ?? raw.SkippedRowCount ?? 0),
    transactionIds: transactionIds.map((id) => String(id ?? "")),
    sessionArchived: Boolean(raw.sessionArchived ?? raw.SessionArchived ?? false),
    sessionStatus: String(raw.sessionStatus ?? raw.SessionStatus ?? "Active"),
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const error = (await response.json()) as { message?: string }
    return error.message ?? fallback
  } catch {
    return fallback
  }
}

export async function getImportSessions(): Promise<ImportSession[]> {
  const response = await fetch(`${API_BASE_URL}/ImportSessions`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to fetch import sessions: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as unknown

  if (!Array.isArray(data)) {
    throw new Error("Import sessions response was not an array")
  }

  return data.map((item) => normalizeImportSession(item as Record<string, unknown>))
}

export async function createImportSession(
  session: CreateImportSessionInput,
): Promise<ImportSession> {
  const response = await fetch(`${API_BASE_URL}/ImportSessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(session),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to create import session: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeImportSession(data)
}

export async function deleteImportSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/ImportSessions/${sessionId}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to delete import session: ${response.status} ${response.statusText}`,
      ),
    )
  }
}

export async function updateImportSessionRowDestinationAccount(
  sessionId: string,
  rowId: string,
  destinationAccountId: string | null,
): Promise<ImportSessionRow> {
  const response = await fetch(
    `${API_BASE_URL}/ImportSessions/${sessionId}/rows/${rowId}/destination-account`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ destinationAccountId }),
    },
  )

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to update destination account: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeImportSessionRow(data)
}

export async function updateImportSessionSourceAccount(
  sessionId: string,
  sourceAccountId: string | null,
): Promise<ImportSession> {
  const response = await fetch(`${API_BASE_URL}/ImportSessions/${sessionId}/source-account`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ sourceAccountId }),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to update source account: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeImportSession(data)
}

export async function updateImportSessionTitle(
  sessionId: string,
  fileName: string | null,
): Promise<ImportSession> {
  const response = await fetch(`${API_BASE_URL}/ImportSessions/${sessionId}/title`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fileName }),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to update import session title: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeImportSession(data)
}

export async function addImportSessionToLedger(
  sessionId: string,
): Promise<AddImportSessionToLedgerResult> {
  const response = await fetch(`${API_BASE_URL}/ImportSessions/${sessionId}/add-to-ledger`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to add import session to ledger: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeAddImportSessionToLedgerResult(data)
}

export async function reapplyImportSessionLearning(
  sessionId: string,
): Promise<ImportSession> {
  const response = await fetch(`${API_BASE_URL}/ImportSessions/${sessionId}/learning/reapply`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to reapply import session learning: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeImportSession(data)
}

export async function revertImportSessionLearning(
  sessionId: string,
): Promise<ImportSession> {
  const response = await fetch(`${API_BASE_URL}/ImportSessions/${sessionId}/learning/revert`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to revert import session learning: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeImportSession(data)
}

export async function deleteImportSessionRows(
  sessionId: string,
  rowIds: string[],
): Promise<ImportSession> {
  const response = await fetch(`${API_BASE_URL}/ImportSessions/${sessionId}/rows`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ rowIds }),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to delete import session rows: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeImportSession(data)
}
