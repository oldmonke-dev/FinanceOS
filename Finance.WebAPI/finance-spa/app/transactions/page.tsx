"use client"

import { useMemo, useState } from "react"

import { AccountSearchSelect } from "@/components/account-search-select"
import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createTransaction } from "@/lib/transactions"
import { type CreateTransactionInput, type Transaction } from "@/models/transaction"

type SplitDraft = {
  accountId: string
  amount: string
  memo: string
}

const emptySplit = (): SplitDraft => ({
  accountId: "",
  amount: "",
  memo: "",
})

export default function TransactionsPage() {
  const { accounts, isLoading, errorMessage } = useAccounts()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdTransaction, setCreatedTransaction] = useState<Transaction | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionDate, setTransactionDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [description, setDescription] = useState("")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [splits, setSplits] = useState<SplitDraft[]>([emptySplit(), emptySplit()])
  const hasTwoSplitMirrorMode = splits.length === 2
  const accountPathLookup = useMemo(() => {
    const accountById = new Map(accounts.map((account) => [account.id, account]))
    const pathById = new Map<string, string>()

    function buildPath(accountId: string): string {
      const cached = pathById.get(accountId)
      if (cached) {
        return cached
      }

      const segments: string[] = []
      let current = accountById.get(accountId)

      while (current) {
        segments.unshift(current.name)
        current =
          current.parentAccountId != null
            ? accountById.get(current.parentAccountId) ?? undefined
            : undefined
      }

      const path = segments.join(" / ")
      pathById.set(accountId, path)
      return path
    }

    accounts.forEach((account) => {
      buildPath(account.id)
    })

    return pathById
  }, [accounts])

  const splitTotal = splits.reduce(
    (total, split, index) => total + getEffectiveSplitAmount(split.amount, index, hasTwoSplitMirrorMode),
    0,
  )

  function updateSplit(index: number, field: keyof SplitDraft, value: string) {
    setSplits((current) => {
      if (field !== "amount" || current.length !== 2) {
        return current.map((split, splitIndex) =>
          splitIndex === index ? { ...split, [field]: value } : split,
        )
      }

      const normalizedAmount = normalizeUnsignedAmount(value)

      return current.map((split, splitIndex) => {
        if (splitIndex === 0) {
          return { ...split, amount: normalizedAmount }
        }

        return {
          ...split,
          amount: normalizedAmount ? formatMirroredAmount(normalizedAmount) : "",
        }
      })
    })
  }

  function addSplit() {
    setSplits((current) => [...current, emptySplit()])
  }

  function removeSplit(index: number) {
    setSplits((current) => current.filter((_, splitIndex) => splitIndex !== index))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)
    setCreatedTransaction(null)
    setIsSubmitting(true)

    try {
      const payload: CreateTransactionInput = {
        transactionDate: new Date(transactionDate).toISOString(),
        description,
        referenceNumber,
        splits: splits.map((split, index) => ({
          accountId: split.accountId,
          amount: getEffectiveSplitAmount(split.amount, index, hasTwoSplitMirrorMode),
          memo: split.memo,
        })),
      }

      const created = await createTransaction(payload)
      setCreatedTransaction(created)
      setSplits([emptySplit(), emptySplit()])
      setDescription("")
      setReferenceNumber("")
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unknown error while creating transaction.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppShell
      title="Transactions"
      subtitle="Create a balanced transaction with split lines"
      badge={isLoading ? "Loading accounts" : `${accounts.length} accounts available`}
    >
      <section>
        <form onSubmit={handleSubmit} className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Transaction date</span>
              <Input
                type="date"
                value={transactionDate}
                onChange={(event) => setTransactionDate(event.target.value)}
                required
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Reference number</span>
              <Input
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.target.value)}
                placeholder="Optional reference"
              />
            </label>
          </div>

          <label className="mt-4 block space-y-2 text-sm">
            <span className="font-medium">Description</span>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Groceries, salary, transfer..."
            />
          </label>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Splits</h2>
                <p className="text-sm text-muted-foreground">
                  Each split posts one amount to one account.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={addSplit}>
                Add split
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {splits.map((split, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-2xl border bg-background/70 p-4 md:grid-cols-[1.2fr_0.8fr_1fr_auto]"
                >
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">
                      {hasTwoSplitMirrorMode ? (index === 0 ? "From account" : "To account") : "Account"}
                    </span>
                    <AccountSearchSelect
                      accounts={accounts}
                      value={split.accountId}
                      onValueChange={(value) => updateSplit(index, "accountId", value ?? "")}
                      placeholder="Select account"
                      getAccountLabel={(account) => accountPathLookup.get(account.id) ?? account.name}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">
                      {hasTwoSplitMirrorMode ? (index === 0 ? "Amount out (-)" : "Amount in (+)") : "Amount"}
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      value={split.amount}
                      onChange={(event) => updateSplit(index, "amount", event.target.value)}
                      placeholder="0.00"
                      readOnly={hasTwoSplitMirrorMode && index === 1}
                      required
                    />
                    {hasTwoSplitMirrorMode && index === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Enter one positive amount. This side is saved as the negative "from" split.
                      </p>
                    ) : null}
                    {hasTwoSplitMirrorMode && index === 1 ? (
                      <p className="text-xs text-muted-foreground">
                        Auto-balanced positive "to" split.
                      </p>
                    ) : null}
                    {!hasTwoSplitMirrorMode ? (
                      <p className="text-xs text-muted-foreground">
                        Use negative values for the from account and positive values for the to account.
                      </p>
                    ) : null}
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">Memo</span>
                    <Input
                      value={split.memo}
                      onChange={(event) => updateSplit(index, "memo", event.target.value)}
                      placeholder="Optional memo"
                    />
                  </label>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeSplit(index)}
                      disabled={splits.length <= 2}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Split total</p>
              <p
                className={`text-lg font-semibold ${
                  splitTotal === 0 ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {splitTotal.toFixed(2)}
              </p>
            </div>
            <Button type="submit" disabled={isSubmitting || isLoading}>
              {isSubmitting ? "Saving..." : "Create transaction"}
            </Button>
          </div>

          {errorMessage ? (
            <p className="mt-4 text-sm text-destructive">{errorMessage}</p>
          ) : null}
          {submitError ? (
            <p className="mt-4 text-sm text-destructive">{submitError}</p>
          ) : null}
        </form>
      </section>
      <section className="mt-4 rounded-3xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Latest result</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The backend returns the created transaction with its saved split lines.
        </p>

        {createdTransaction ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Transaction id</p>
              <p className="mt-1 font-semibold">{createdTransaction.id}</p>
            </div>
            {createdTransaction.splits.map((split) => (
              <div
                key={`${createdTransaction.id}-${split.id}-${split.accountId}`}
                className="rounded-2xl border bg-background/70 p-4 text-sm"
              >
                <p className="font-medium">
                  {accountPathLookup.get(split.accountId) ?? "Account"}
                </p>
                <p className="text-muted-foreground">Amount: {split.amount}</p>
                {split.memo ? <p className="text-muted-foreground">Memo: {split.memo}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Submit a balanced transaction to see the response here.
          </p>
        )}
      </section>
    </AppShell>
  )
}

function normalizeUnsignedAmount(value: string) {
  if (!value) {
    return ""
  }

  return value.replace(/^[+-]/, "")
}

function formatMirroredAmount(value: string) {
  return value
}

function getEffectiveSplitAmount(value: string, index: number, hasTwoSplitMirrorMode: boolean) {
  const numericValue = Number(value || 0)

  if (!hasTwoSplitMirrorMode) {
    return numericValue
  }

  return index === 0 ? -Math.abs(numericValue) : Math.abs(numericValue)
}
