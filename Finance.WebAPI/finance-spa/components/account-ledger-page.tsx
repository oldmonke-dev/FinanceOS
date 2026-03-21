"use client"

import { Fragment } from "react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ChevronRight, Landmark, ReceiptText, Scale, Trash2 } from "lucide-react"
import { notFound } from "next/navigation"

import { AccountSearchSelect } from "@/components/account-search-select"
import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { buildAccountTree, formatAccountType } from "@/lib/accounts"
import { deleteTransaction, getTransactions, updateTransaction } from "@/lib/transactions"
import type { Transaction } from "@/models/transaction"

export function AccountLedgerPage({ accountId }: { accountId: string }) {
  const { accounts, isLoading, errorMessage } = useAccounts()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true)
  const [transactionsError, setTransactionsError] = useState<string | null>(null)
  const [expandedTransactionIds, setExpandedTransactionIds] = useState<Set<string>>(new Set())
  const [deletingTransactionIds, setDeletingTransactionIds] = useState<Set<string>>(new Set())
  const account = accounts.find((item) => item.id === accountId) ?? null
  const resolvedAccountId = account?.id ?? null
  const tree = useMemo(() => buildAccountTree(accounts), [accounts])
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
  const availableDestinationAccounts = useMemo(
    () =>
      resolvedAccountId == null
        ? []
        : accounts.filter((item) => item.id !== resolvedAccountId),
    [accounts, resolvedAccountId],
  )
  const currentBalance = useMemo(() => {
    if (!resolvedAccountId) {
      return 0
    }

    return transactions.reduce((sum, transaction) => {
      const split = transaction.splits.find((item) => item.accountId === resolvedAccountId)
      return sum + (split?.amount ?? 0)
    }, 0)
  }, [transactions, resolvedAccountId])
  const transactionRows = useMemo(() => {
    if (!resolvedAccountId) {
      return []
    }

    const baseRows = transactions.map((transaction) => {
      const accountSplit =
        transaction.splits.find((item) => item.accountId === resolvedAccountId) ?? null
      const counterpartNames = transaction.splits
        .filter((item) => item.accountId !== resolvedAccountId)
        .map((item) => getAccountName(item.accountId, accounts))
        .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)

      return {
        transaction,
        accountSplit,
        destinationSplit:
          transaction.splits.find((item) => item.accountId !== resolvedAccountId) ?? null,
        counterpartNames,
      }
    })

    const trailingBalanceByTransactionId = new Map<string, number>()
    let runningBalance = 0

    for (const row of [...baseRows].reverse()) {
      runningBalance += row.accountSplit?.amount ?? 0
      trailingBalanceByTransactionId.set(row.transaction.id, runningBalance)
    }

    return baseRows.map((row) => ({
      ...row,
      trailingBalance: trailingBalanceByTransactionId.get(row.transaction.id) ?? 0,
    }))
  }, [transactions, resolvedAccountId, accounts])

  useEffect(() => {
    let isCancelled = false

    async function loadTransactions() {
      setIsLoadingTransactions(true)

      try {
        const nextTransactions = await getTransactions(accountId)

        if (isCancelled) {
          return
        }

        setTransactions(nextTransactions)
        setTransactionsError(null)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setTransactions([])
        setTransactionsError(
          error instanceof Error ? error.message : "Failed to load ledger transactions.",
        )
      } finally {
        if (!isCancelled) {
          setIsLoadingTransactions(false)
        }
      }
    }

    void loadTransactions()

    return () => {
      isCancelled = true
    }
  }, [accountId])

  if (isLoading) {
    return (
      <AppShell title="General Ledger" subtitle="Loading account ledger">
        <div className="rounded-3xl border bg-card p-10 text-center text-muted-foreground">
          Loading account ledger...
        </div>
      </AppShell>
    )
  }

  if (errorMessage) {
    return (
      <AppShell title="General Ledger" subtitle="Account data could not be loaded">
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {errorMessage}
        </div>
      </AppShell>
    )
  }

  if (!account) {
    notFound()
  }

  const resolvedAccount = account

  const accountPath = buildAccountPath(resolvedAccount.id, tree) ?? resolvedAccount.name

  async function persistTransaction(nextTransaction: Transaction) {
    try {
      const savedTransaction = await updateTransaction(nextTransaction.id, {
        description: nextTransaction.description,
        referenceNumber: nextTransaction.referenceNumber,
        splits: nextTransaction.splits.map((split) => ({
          id: split.id,
          accountId: split.accountId,
          amount: split.amount,
          memo: split.memo,
        })),
      })

      setTransactions((current) =>
        savedTransaction.splits.some((split) => split.accountId === resolvedAccount.id)
          ? current.map((transaction) =>
              transaction.id !== savedTransaction.id ? transaction : savedTransaction,
            )
          : current.filter((transaction) => transaction.id !== savedTransaction.id),
      )
      setTransactionsError(null)
    } catch (error) {
      setTransactionsError(
        error instanceof Error ? error.message : "Failed to save ledger changes.",
      )
    }
  }

  function updateTransactionField(
    transactionId: string,
    field: "description" | "referenceNumber",
    value: string,
  ) {
    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id !== transactionId
          ? transaction
          : {
              ...transaction,
              [field]: field === "referenceNumber" ? (value.trim() ? value : null) : value,
            },
      ),
    )
  }

  function toggleExpanded(transactionId: string) {
    setExpandedTransactionIds((current) => {
      const next = new Set(current)

      if (next.has(transactionId)) {
        next.delete(transactionId)
      } else {
        next.add(transactionId)
      }

      return next
    })
  }

  function getTransactionSnapshot(transactionId: string) {
    return transactions.find((transaction) => transaction.id === transactionId) ?? null
  }

  function updateTransactionMemo(transactionId: string, memo: string) {
    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id !== transactionId
          ? transaction
          : {
              ...transaction,
              splits: transaction.splits.map((split) =>
                split.accountId !== resolvedAccount.id
                  ? split
                  : {
                      ...split,
                      memo: memo.trim() ? memo : null,
                    },
              ),
            },
      ),
    )
  }

  function updateSplitField(
    transactionId: string,
    splitId: string,
    field: "memo",
    value: string | null,
  ) {
    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id !== transactionId
          ? transaction
          : {
              ...transaction,
              splits: transaction.splits.map((split) =>
                split.id !== splitId
                  ? split
                  : {
                      ...split,
                      [field]: value && value.trim() ? value : null,
                    },
              ),
            },
      ),
    )
  }

  function updateSplitAccount(transactionId: string, splitId: string, accountId: string) {
    let nextTransaction: Transaction | null = null

    setTransactions((current) =>
      current.map((transaction) => {
        if (transaction.id !== transactionId) {
          return transaction
        }

        nextTransaction = {
          ...transaction,
          splits: transaction.splits.map((split) =>
            split.id !== splitId
              ? split
              : {
                  ...split,
                  accountId,
                },
          ),
        }

        return nextTransaction
      }),
    )

    if (nextTransaction) {
      void persistTransaction(nextTransaction)
    }
  }

  function updateSplitAmount(transactionId: string, splitId: string, amountValue: string) {
    const parsedAmount = Number(amountValue)

    if (!Number.isFinite(parsedAmount)) {
      return
    }

    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id !== transactionId
          ? transaction
          : {
              ...transaction,
              splits: transaction.splits.map((split) =>
                split.id !== splitId
                  ? split
                  : {
                      ...split,
                      amount: parsedAmount,
                    },
              ),
            },
      ),
    )
  }

  async function saveCurrentTransaction(transactionId: string) {
    const currentTransaction = getTransactionSnapshot(transactionId)
    if (!currentTransaction) {
      return
    }

    await persistTransaction(currentTransaction)
  }

  function updateDestinationAccount(transactionId: string, destinationAccountId: string) {
    let nextTransaction: Transaction | null = null

    setTransactions((current) =>
      current.map((transaction) => {
        if (transaction.id !== transactionId) {
          return transaction
        }

        nextTransaction = {
          ...transaction,
          splits: transaction.splits.map((split, splitIndex) => {
            const isDestinationSplit =
              split.accountId !== resolvedAccount.id &&
              splitIndex ===
                transaction.splits.findIndex((item) => item.accountId !== resolvedAccount.id)

            return isDestinationSplit
              ? {
                  ...split,
                  accountId: destinationAccountId,
                }
              : split
          }),
        }

        return nextTransaction
      }),
    )

    if (nextTransaction) {
      void persistTransaction(nextTransaction)
    }
  }

  async function handleDeleteTransaction(transactionId: string) {
    const confirmed = window.confirm(
      "Delete this transaction from the general ledger? Both splits will be removed.",
    )

    if (!confirmed) {
      return
    }

    setDeletingTransactionIds((current) => new Set(current).add(transactionId))

    try {
      await deleteTransaction(transactionId)
      setTransactions((current) => current.filter((transaction) => transaction.id !== transactionId))
      setExpandedTransactionIds((current) => {
        const next = new Set(current)
        next.delete(transactionId)
        return next
      })
      setTransactionsError(null)
    } catch (error) {
      setTransactionsError(
        error instanceof Error ? error.message : "Failed to delete ledger transaction.",
      )
    } finally {
      setDeletingTransactionIds((current) => {
        const next = new Set(current)
        next.delete(transactionId)
        return next
      })
    }
  }

  return (
    <AppShell
      title="General Ledger"
      subtitle="Account-specific ledger workspace"
      badge={formatAccountType(account.accountType)}
    >
      <div className="space-y-4">
        <div>
          <Button asChild type="button" variant="outline">
            <Link href="/accounts">
              <ArrowLeft />
              Back to account tree
            </Link>
          </Button>
        </div>

        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Landmark className="size-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold">{resolvedAccount.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{accountPath}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              Account type: {formatAccountType(resolvedAccount.accountType)}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ReceiptText className="size-4" />
                <span className="text-sm">Entries</span>
              </div>
              <p className="mt-3 text-2xl font-semibold">{transactions.length}</p>
            </div>
            <div className="rounded-2xl border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Scale className="size-4" />
                <span className="text-sm">Current balance</span>
              </div>
              <p className="mt-3 text-2xl font-semibold">{formatCurrency(currentBalance)}</p>
            </div>
            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Under account</p>
              <p className="mt-3 text-lg font-semibold">
                {getParentAccountName(resolvedAccount.parentAccountId, accounts) ?? "Top level"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Ledger activity</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Transactions are filtered to this account and show the matching split amount with
            counterpart accounts.
          </p>

          {transactionsError ? (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
              {transactionsError}
            </div>
          ) : isLoadingTransactions ? (
            <div className="mt-6 rounded-2xl border bg-background/70 p-10 text-center text-muted-foreground">
              Loading ledger entries...
            </div>
          ) : transactionRows.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed bg-background/70 p-10 text-center text-muted-foreground">
              No ledger entries to show yet.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[56rem] border-collapse text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="border-b px-4 py-3 text-left font-medium">Splits</th>
                    <th className="border-b px-4 py-3 text-left font-medium">Date</th>
                    <th className="border-b px-4 py-3 text-left font-medium">Description</th>
                    <th className="border-b px-4 py-3 text-left font-medium">Reference</th>
                    <th className="border-b px-4 py-3 text-left font-medium">Destination</th>
                    <th className="border-b px-4 py-3 text-left font-medium">Memo</th>
                    <th className="border-b px-4 py-3 text-right font-medium">Amount</th>
                    <th className="border-b px-4 py-3 text-right font-medium">Trailing Balance</th>
                    <th className="border-b px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionRows.map(({ transaction, accountSplit, destinationSplit, counterpartNames, trailingBalance }, rowIndex) => (
                    <Fragment key={transaction.id}>
                      <tr className={rowIndex % 2 === 0 ? "bg-muted/10" : "bg-muted/35"}>
                        <td className="border-t px-4 py-3 align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => toggleExpanded(transaction.id)}
                            aria-label={
                              expandedTransactionIds.has(transaction.id)
                                ? "Hide transaction splits"
                                : "Show transaction splits"
                            }
                          >
                            <ChevronRight
                              className={`size-4 transition ${
                                expandedTransactionIds.has(transaction.id) ? "rotate-90" : ""
                              }`}
                            />
                          </Button>
                        </td>
                        <td className="border-t px-4 py-3 align-top whitespace-nowrap">
                          {formatDate(transaction.transactionDate)}
                        </td>
                        <td className="border-t px-4 py-3 align-top">
                          <Input
                            value={transaction.description}
                            onChange={(event) =>
                              updateTransactionField(transaction.id, "description", event.target.value)
                            }
                            onBlur={() => void saveCurrentTransaction(transaction.id)}
                            placeholder="Transaction description"
                          />
                        </td>
                        <td className="border-t px-4 py-3 align-top">
                          <Input
                            value={transaction.referenceNumber ?? ""}
                            onChange={(event) =>
                              updateTransactionField(
                                transaction.id,
                                "referenceNumber",
                                event.target.value,
                              )
                            }
                            onBlur={() => void saveCurrentTransaction(transaction.id)}
                            placeholder="Reference"
                          />
                        </td>
                        <td className="border-t px-4 py-3 align-top">
                          {destinationSplit ? (
                            <AccountSearchSelect
                              accounts={availableDestinationAccounts}
                              value={destinationSplit.accountId}
                              onValueChange={(value) =>
                                value ? updateDestinationAccount(transaction.id, value) : undefined
                              }
                              placeholder="Select destination account"
                              className="min-w-64"
                              getAccountLabel={(account) =>
                                accountPathLookup.get(account.id) ?? account.name
                              }
                            />
                          ) : counterpartNames.length > 0 ? (
                            counterpartNames.join(", ")
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="border-t px-4 py-3 align-top">
                          <Input
                            value={accountSplit?.memo ?? ""}
                            onChange={(event) => updateTransactionMemo(transaction.id, event.target.value)}
                            onBlur={() => void saveCurrentTransaction(transaction.id)}
                            placeholder="Memo"
                          />
                        </td>
                        <td className="border-t px-4 py-3 text-right align-top font-medium tabular-nums">
                          {formatCurrency(accountSplit?.amount ?? 0)}
                        </td>
                        <td className="border-t px-4 py-3 text-right align-top font-medium tabular-nums text-muted-foreground">
                          {formatCurrency(trailingBalance)}
                        </td>
                        <td className="border-t px-4 py-3 text-right align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() => void handleDeleteTransaction(transaction.id)}
                            disabled={deletingTransactionIds.has(transaction.id)}
                            aria-label="Delete transaction"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                      {expandedTransactionIds.has(transaction.id) ? (
                        <tr className={rowIndex % 2 === 0 ? "bg-muted/45" : "bg-muted/60"}>
                          <td className="border-t px-4 py-3" colSpan={9}>
                            <div className="rounded-xl border bg-background/85 p-3">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                  Split breakdown
                                </h4>
                                <span className="text-[11px] text-muted-foreground">
                                  {transaction.splits.length} split{transaction.splits.length === 1 ? "" : "s"}
                                </span>
                              </div>
                              <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full min-w-[42rem] border-collapse text-sm">
                                  <thead className="bg-muted/50">
                                    <tr>
                                      <th className="border-b px-3 py-2 text-left font-medium">Account</th>
                                      <th className="border-b px-3 py-2 text-left font-medium">Memo</th>
                                      <th className="border-b px-3 py-2 text-right font-medium">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {transaction.splits.map((split, splitIndex) => (
                                      <tr key={split.id} className={splitIndex % 2 === 0 ? "bg-card/70" : "bg-card/95"}>
                                        <td className="border-t px-3 py-2 align-top">
                                          <AccountSearchSelect
                                            accounts={accounts}
                                            value={split.accountId}
                                            onValueChange={(value) => {
                                              if (!value) {
                                                return
                                              }

                                              updateSplitAccount(transaction.id, split.id, value)
                                            }}
                                            getAccountLabel={(account) =>
                                              accountPathLookup.get(account.id) ?? account.name
                                            }
                                          />
                                        </td>
                                        <td className="border-t px-3 py-2 align-top">
                                          <Input
                                            value={split.memo ?? ""}
                                            onChange={(event) =>
                                              updateSplitField(
                                                transaction.id,
                                                split.id,
                                                "memo",
                                                event.target.value,
                                              )
                                            }
                                            onBlur={() => void saveCurrentTransaction(transaction.id)}
                                            placeholder="Memo"
                                          />
                                        </td>
                                        <td className="border-t px-3 py-2 align-top">
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={String(split.amount)}
                                            onChange={(event) =>
                                              updateSplitAmount(
                                                transaction.id,
                                                split.id,
                                                event.target.value,
                                              )
                                            }
                                            onBlur={() => void saveCurrentTransaction(transaction.id)}
                                            className="text-right tabular-nums"
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}

function getAccountName(accountId: string, accounts: Array<{ id: string; name: string }>) {
  return accounts.find((account) => account.id === accountId)?.name ?? accountId
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function getParentAccountName(
  parentAccountId: string | null,
  accounts: Array<{ id: string; name: string }>,
) {
  if (!parentAccountId) {
    return null
  }

  return accounts.find((account) => account.id === parentAccountId)?.name ?? null
}

function buildAccountPath(
  accountId: string,
  nodes: ReturnType<typeof buildAccountTree>,
  trail: string[] = [],
): string | null {
  for (const node of nodes) {
    const nextTrail = [...trail, node.name]

    if (node.id === accountId) {
      return nextTrail.join(" / ")
    }

    const childMatch = buildAccountPath(accountId, node.children, nextTrail)
    if (childMatch) {
      return childMatch
    }
  }

  return null
}
