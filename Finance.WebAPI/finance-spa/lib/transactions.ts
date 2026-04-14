import {
  type CreateTransactionInput,
  type Transaction,
  type UpdateTransactionInput,
} from "@/models/transaction"
import { normalizeSplitSide } from "@/lib/accounting"
import { authFetch } from "@/lib/auth"
import { API_BASE_URL } from "@/lib/api-config"

function normalizeTransaction(raw: Record<string, unknown>): Transaction {
  const splitSource = raw.splits ?? raw.Splits
  const splits: unknown[] = Array.isArray(splitSource) ? splitSource : []

  return {
    id: String(raw.id ?? raw.Id ?? ""),
    transactionDate: String(raw.transactionDate ?? raw.TransactionDate ?? ""),
    ledgerSequence: Number(raw.ledgerSequence ?? raw.LedgerSequence ?? raw.sortOrder ?? raw.SortOrder ?? 0),
    description: String(raw.description ?? raw.Description ?? ""),
    referenceNumber:
      raw.referenceNumber == null && raw.ReferenceNumber == null
        ? null
        : String(raw.referenceNumber ?? raw.ReferenceNumber),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ""),
    splits: splits.map((split) => {
      const item = split as Record<string, unknown>

      return {
        id: String(item.id ?? item.Id ?? ""),
        accountId: String(item.accountId ?? item.AccountId ?? ""),
        amount: Math.abs(Number(item.amount ?? item.Amount ?? 0)),
        side: normalizeSplitSide(item.side ?? item.Side, Number(item.amount ?? item.Amount ?? 0)),
        memo:
          item.memo == null && item.Memo == null ? null : String(item.memo ?? item.Memo),
      }
    }),
  }
}

export async function createTransaction(
  transaction: CreateTransactionInput,
): Promise<Transaction> {
  const response = await authFetch(`${API_BASE_URL}/Transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(transaction),
  })

  if (!response.ok) {
    let message = `Failed to create transaction: ${response.status} ${response.statusText}`

    try {
      const error = (await response.json()) as { message?: string }
      if (error.message) {
        message = error.message
      }
    } catch {}

    throw new Error(message)
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeTransaction(data)
}

export async function getTransactions(accountId?: string): Promise<Transaction[]> {
  const url =
    typeof window === "undefined"
      ? new URL(`${API_BASE_URL}/Transactions`)
      : new URL(`${API_BASE_URL}/Transactions`, window.location.origin)

  if (accountId) {
    url.searchParams.set("accountId", accountId)
  }

  const response = await authFetch(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    let message = `Failed to fetch transactions: ${response.status} ${response.statusText}`

    try {
      const error = (await response.json()) as { message?: string }
      if (error.message) {
        message = error.message
      }
    } catch {}

    throw new Error(message)
  }

  const data = (await response.json()) as unknown

  if (!Array.isArray(data)) {
    throw new Error("Transactions response was not an array")
  }

  return data.map((item) => normalizeTransaction(item as Record<string, unknown>))
}

export async function updateTransaction(
  transactionId: string,
  transaction: UpdateTransactionInput,
): Promise<Transaction> {
  const response = await authFetch(`${API_BASE_URL}/Transactions/${transactionId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(transaction),
  })

  if (!response.ok) {
    let message = `Failed to update transaction: ${response.status} ${response.statusText}`

    try {
      const error = (await response.json()) as { message?: string }
      if (error.message) {
        message = error.message
      }
    } catch {}

    throw new Error(message)
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeTransaction(data)
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/Transactions/${transactionId}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    let message = `Failed to delete transaction: ${response.status} ${response.statusText}`

    try {
      const error = (await response.json()) as { message?: string }
      if (error.message) {
        message = error.message
      }
    } catch {}

    throw new Error(message)
  }
}
