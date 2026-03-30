"use client"

import { useMemo, useState } from "react"
import { Info } from "lucide-react"

import { AccountSearchSelect } from "@/components/account-search-select"
import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { useSnackbar } from "@/components/providers/snackbar-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getAccountEffectForSplitSide,
  getOppositeSide,
  getSplitSideForAccountEffect,
  getSignedAmount,
  getTwoSplitAccountLabel,
  type AccountEffect,
  type SplitSide,
} from "@/lib/accounting"
import { createTransaction } from "@/lib/transactions"
import { type CreateTransactionInput, type Transaction } from "@/models/transaction"

type SplitDraft = {
  accountId: string
  amount: string
  memo: string
  side: SplitSide
}

const emptySplit = (side: SplitSide = "debit"): SplitDraft => ({
  accountId: "",
  amount: "",
  memo: "",
  side,
})

export default function TransactionsPage() {
  const { accounts, isLoading, errorMessage } = useAccounts()
  const { showSnackbar } = useSnackbar()
  const [createdTransaction, setCreatedTransaction] = useState<Transaction | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionDate, setTransactionDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [description, setDescription] = useState("")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [splits, setSplits] = useState<SplitDraft[]>([emptySplit("debit"), emptySplit("credit")])
  const hasTwoSplitMirrorMode = splits.length === 2
  const postableAccounts = useMemo(
    () => accounts.filter((account) => account.currentUserPermissions.canPost),
    [accounts],
  )
  const accountPathLookup = useMemo(() => {
    const accountById = new Map(postableAccounts.map((account) => [account.id, account]))
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

    postableAccounts.forEach((account) => {
      buildPath(account.id)
    })

    return pathById
  }, [postableAccounts])
  const accountTypeById = useMemo(
    () => new Map(postableAccounts.map((account) => [account.id, account.accountType])),
    [postableAccounts],
  )

  const splitTotal = splits.reduce(
    (total, split) => total + getEffectiveSplitAmount(split),
    0,
  )
  const primarySplitSide = splits[0]?.side ?? "debit"
  const signTooltip =
    hasTwoSplitMirrorMode
      ? "Choose Increase or Decrease for the first split. The paired split automatically uses the opposite posting side."
      : "Choose whether the split increases or decreases the selected account."
  const amountTooltip =
    hasTwoSplitMirrorMode
      ? "Enter one amount. The second split mirrors it automatically."
      : "Enter the absolute amount. The Balance Change field determines whether it increases or decreases the selected account."

  function updateSplit(index: number, field: keyof SplitDraft, value: string) {
    setSplits((current) => {
      if (current.length !== 2) {
        return current.map((split, splitIndex) =>
          splitIndex === index ? { ...split, [field]: value } : split,
        )
      }

      if (field === "amount") {
        const normalizedAmount = normalizeUnsignedAmount(value)

        return current.map((split) => ({
          ...split,
          amount: normalizedAmount,
        }))
      }

      return current.map((split, splitIndex) =>
        splitIndex === index ? { ...split, [field]: value } : split,
      )
    })
  }

  function updateSplitEffect(index: number, effect: AccountEffect) {
    setSplits((current) => {
      const currentSplit = current[index]
      if (!currentSplit) {
        return current
      }

      const currentAccountType = accountTypeById.get(currentSplit.accountId)
      const nextSide = getSplitSideForAccountEffect(currentAccountType, effect)

      if (current.length !== 2) {
        return current.map((split, splitIndex) =>
          splitIndex === index ? { ...split, side: nextSide } : split,
        )
      }

      const mirroredSide = getOppositeSide(nextSide)
      return current.map((split, splitIndex) => ({
        ...split,
        side: splitIndex === index ? nextSide : mirroredSide,
      }))
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
    setCreatedTransaction(null)
    setIsSubmitting(true)

    try {
        const payload: CreateTransactionInput = {
          transactionDate: new Date(transactionDate).toISOString(),
          description,
          referenceNumber,
          splits: splits.map((split) => ({
            accountId: split.accountId,
            amount: Math.abs(Number(split.amount || 0)),
            side: split.side,
            memo: split.memo,
          })),
        }

      const created = await createTransaction(payload)
      setCreatedTransaction(created)
      setSplits([emptySplit("debit"), emptySplit("credit")])
      setDescription("")
      setReferenceNumber("")
      showSnackbar({ message: "Transaction created.", tone: "success" })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Unknown error while creating transaction.",
        tone: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppShell
      title="Transactions"
      subtitle="Create a balanced transaction with split lines"
      badge={isLoading ? "Loading accounts" : `${postableAccounts.length} postable accounts`}
    >
      <div className="mx-auto w-full space-y-4 xl:w-[65%]">
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
                  className="grid gap-3 rounded-2xl border bg-background/70 p-4 md:grid-cols-[1.2fr_8rem_0.8fr_1fr_auto]"
                >
                  <label className="space-y-2 text-sm">
                    <span className="flex h-5 items-center font-medium leading-none">
                      {hasTwoSplitMirrorMode
                        ? getTwoSplitAccountLabel(index, primarySplitSide)
                        : "Account"}
                    </span>
                    <AccountSearchSelect
                      accounts={postableAccounts}
                      value={split.accountId}
                      onValueChange={(value) => updateSplit(index, "accountId", value ?? "")}
                      placeholder="Select account"
                      getAccountLabel={(account) => accountPathLookup.get(account.id) ?? account.name}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="flex h-5 items-center gap-1.5 font-medium leading-none whitespace-nowrap">
                      <span className="whitespace-nowrap">Balance Change</span>
                      <FieldInfoTooltip content={signTooltip} />
                    </span>
                    <Select
                      value={getAccountEffectForSplitSide(accountTypeById.get(split.accountId), split.side)}
                      onValueChange={(value) => updateSplitEffect(index, value as AccountEffect)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="increase">Increase</SelectItem>
                        <SelectItem value="decrease">Decrease</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="flex h-5 items-center gap-1.5 font-medium leading-none">
                      <span>Amount</span>
                      <FieldInfoTooltip content={amountTooltip} />
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      value={split.amount}
                      onChange={(event) => updateSplit(index, "amount", event.target.value)}
                      placeholder="0.00"
                      readOnly={hasTwoSplitMirrorMode && index === 1}
                      className="h-9"
                      required
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="flex h-5 items-center font-medium leading-none">Memo</span>
                    <Input
                      value={split.memo}
                      onChange={(event) => updateSplit(index, "memo", event.target.value)}
                      placeholder="Optional memo"
                      className="h-9"
                    />
                  </label>
                  <div className="flex self-center items-center justify-center">
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
                <p className="text-muted-foreground">
                  Balance change: {capitalizeEffect(getAccountEffectForSplitSide(accountTypeById.get(split.accountId), split.side))} {split.amount}
                </p>
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
      </div>
    </AppShell>
  )
}

function normalizeUnsignedAmount(value: string) {
  if (!value) {
    return ""
  }

  return value.replace(/^[+-]/, "")
}

function getEffectiveSplitAmount(split: SplitDraft) {
  const numericValue = Math.abs(Number(split.amount || 0))
  return getSignedAmount(numericValue, split.side)
}

function capitalizeEffect(effect: AccountEffect) {
  return effect === "increase" ? "Increase" : "Decrease"
}

function FieldInfoTooltip({ content }: { content: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
            aria-label="Field information"
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-center">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
