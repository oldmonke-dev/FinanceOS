import type { SplitSide } from "@/lib/accounting"

export type Split = {
  id: string
  accountId: string
  amount: number
  side: SplitSide
  memo: string | null
}

export type Transaction = {
  id: string
  transactionDate: string
  ledgerSequence: number
  description: string
  referenceNumber: string | null
  createdAt: string
  splits: Split[]
}

export type CreateSplitInput = {
  accountId: string
  amount: number
  side: SplitSide
  memo?: string
}

export type UpdateSplitInput = {
  id: string
  accountId: string
  amount: number
  side: SplitSide
  memo?: string | null
}

export type CreateTransactionInput = {
  transactionDate: string
  description?: string
  referenceNumber?: string
  splits: CreateSplitInput[]
}

export type UpdateTransactionInput = {
  ledgerSequence?: number
  description?: string
  referenceNumber?: string | null
  splits: UpdateSplitInput[]
}
