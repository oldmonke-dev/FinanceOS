import type { Account } from "@/models/account"
import type { Split } from "@/models/transaction"

export type SplitSide = "debit" | "credit"

export function normalizeSplitSide(value: unknown, fallbackAmount = 0): SplitSide {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "debit" || normalized === "credit") {
      return normalized
    }
  }

  return fallbackAmount < 0 ? "debit" : "credit"
}

export function getSignedAmount(amount: number, side: SplitSide) {
  const absoluteAmount = Math.abs(amount)
  return side === "debit" ? -absoluteAmount : absoluteAmount
}

export function getSignedSplitAmount(split: Pick<Split, "amount" | "side">) {
  return getSignedAmount(split.amount, split.side)
}

export function getOppositeSide(side: SplitSide): SplitSide {
  return side === "debit" ? "credit" : "debit"
}

export function getDebitTotal(splits: Array<Pick<Split, "amount" | "side">>) {
  return splits.reduce((sum, split) => sum + (split.side === "debit" ? split.amount : 0), 0)
}

export function getCreditTotal(splits: Array<Pick<Split, "amount" | "side">>) {
  return splits.reduce((sum, split) => sum + (split.side === "credit" ? split.amount : 0), 0)
}

export function getBalanceDeltaForAccount(
  accountType: Account["accountType"] | null | undefined,
  split: Pick<Split, "amount" | "side">,
) {
  const isDebitNormal =
    accountType === 1 ||
    accountType === 5 ||
    accountType === "Asset" ||
    accountType === "Expense"

  if (isDebitNormal) {
    return split.side === "debit" ? split.amount : -split.amount
  }

  return split.side === "credit" ? split.amount : -split.amount
}

function usesNegativeBalanceDisplay(accountType: Account["accountType"] | null | undefined) {
  return (
    accountType === 2 ||
    accountType === 3 ||
    accountType === "Liability" ||
    accountType === "Equity"
  )
}

function usesPositiveMagnitudeDisplay(accountType: Account["accountType"] | null | undefined) {
  return accountType === 4 || accountType === "Income"
}

export function getDisplayBalanceForAccount(
  accountType: Account["accountType"] | null | undefined,
  balance: number,
) {
  if (usesPositiveMagnitudeDisplay(accountType)) {
    return Math.abs(balance)
  }

  return usesNegativeBalanceDisplay(accountType) ? -balance : balance
}

export function getStoredBalanceFromDisplay(
  accountType: Account["accountType"] | null | undefined,
  balance: number,
) {
  return usesNegativeBalanceDisplay(accountType) ? -balance : balance
}

export function getDisplaySplitAmountForAccount(
  accountType: Account["accountType"] | null | undefined,
  split: Pick<Split, "amount" | "side">,
) {
  return getDisplayBalanceForAccount(accountType, getBalanceDeltaForAccount(accountType, split))
}
