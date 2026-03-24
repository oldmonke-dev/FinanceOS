"use client"

import { Fragment } from "react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ChevronRight, Landmark, ReceiptText, Redo2, Save, Scale, Trash2, Undo2 } from "lucide-react"
import { notFound } from "next/navigation"

import { AccountSearchSelect } from "@/components/account-search-select"
import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider"
import { useSnackbar } from "@/components/providers/snackbar-provider"
import { useUserPreferences } from "@/components/providers/user-preferences-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { buildAccountTree, formatAccountType } from "@/lib/accounts"
import { deleteTransaction, getTransactions, updateTransaction } from "@/lib/transactions"
import type { Transaction } from "@/models/transaction"

export function AccountLedgerPage({ accountId }: { accountId: string }) {
  const { accounts, isLoading, errorMessage } = useAccounts()
  const { confirm } = useConfirmationDialog()
  const { showSnackbar } = useSnackbar()
  const { formatNumber } = useUserPreferences()
  const [savedTransactions, setSavedTransactions] = useState<Transaction[]>([])
  const [draftTransactions, setDraftTransactions] = useState<Transaction[]>([])
  const [history, setHistory] = useState<Transaction[][]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true)
  const [transactionsError, setTransactionsError] = useState<string | null>(null)
  const [expandedTransactionIds, setExpandedTransactionIds] = useState<Set<string>>(new Set())
  const [isSavingChanges, setIsSavingChanges] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [showAllRows, setShowAllRows] = useState(false)
  const [rowsPerPage, setRowsPerPage] = useState<10 | 25 | 50>(25)
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

    return draftTransactions.reduce((sum, transaction) => {
      const split = transaction.splits.find((item) => item.accountId === resolvedAccountId)
      return sum + (split?.amount ?? 0)
    }, 0)
  }, [draftTransactions, resolvedAccountId])
  const transactionRows = useMemo(() => {
    if (!resolvedAccountId) {
      return []
    }

    const baseRows = draftTransactions.map((transaction) => {
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
  }, [draftTransactions, resolvedAccountId, accounts])
  const totalPages = Math.max(1, Math.ceil(transactionRows.length / rowsPerPage))
  const pagedTransactionRows = useMemo(
    () =>
      showAllRows
        ? transactionRows
        : transactionRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [currentPage, rowsPerPage, showAllRows, transactionRows],
  )
  const hasUnsavedChanges = useMemo(
    () => serializeTransactions(savedTransactions) !== serializeTransactions(draftTransactions),
    [draftTransactions, savedTransactions],
  )
  const canUndo = historyIndex > 0
  const canRedo = historyIndex >= 0 && historyIndex < history.length - 1

  useEffect(() => {
    let isCancelled = false

    async function loadTransactions() {
      setIsLoadingTransactions(true)

      try {
        const nextTransactions = await getTransactions(accountId)

        if (isCancelled) {
          return
        }

        setSavedTransactions(nextTransactions)
        setDraftTransactions(nextTransactions)
        setHistory([cloneTransactions(nextTransactions)])
        setHistoryIndex(0)
        setTransactionsError(null)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setSavedTransactions([])
        setDraftTransactions([])
        setHistory([])
        setHistoryIndex(-1)
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

  useEffect(() => {
    setCurrentPage(1)
  }, [accountId, rowsPerPage])

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages))
  }, [totalPages])

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
  const inlineTextInputClassName =
    "h-8 rounded-none border-x-0 border-t-0 border-b bg-transparent px-0 py-1 text-xs leading-4.5 shadow-none focus-visible:ring-0"
  const inlineNumberInputClassName = `${inlineTextInputClassName} text-right tabular-nums`
  const inlineTextareaClassName =
    "w-full resize-none overflow-hidden border-0 border-b bg-transparent px-0 py-1 text-xs leading-4.5 shadow-none outline-none focus-visible:ring-0"

  function resizeDescription(element: HTMLTextAreaElement) {
    element.style.height = "0px"
    element.style.height = `${element.scrollHeight}px`
  }

  function commitDraft(
    updater: (current: Transaction[]) => Transaction[],
    options?: { clearExpandedTransactionId?: string },
  ) {
    setDraftTransactions((current) => {
      const next = updater(current)
      const nextHistory = history.slice(0, historyIndex + 1)
      nextHistory.push(cloneTransactions(next))
      setHistory(nextHistory)
      setHistoryIndex(nextHistory.length - 1)
      return next
    })

    if (options?.clearExpandedTransactionId) {
      setExpandedTransactionIds((current) => {
        const next = new Set(current)
        next.delete(options.clearExpandedTransactionId!)
        return next
      })
    }
  }

  function updateTransactionField(
    transactionId: string,
    field: "description" | "referenceNumber",
    value: string,
  ) {
    commitDraft((current) =>
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

  function updateTransactionMemo(transactionId: string, memo: string) {
    commitDraft((current) =>
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
    commitDraft((current) =>
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
    commitDraft((current) =>
      current.map((transaction) => {
        if (transaction.id !== transactionId) {
          return transaction
        }

        return {
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
      }),
    )
  }

  function updateSplitAmount(transactionId: string, splitId: string, amountValue: string) {
    const parsedAmount = Number(amountValue)

    if (!Number.isFinite(parsedAmount)) {
      return
    }

    commitDraft((current) =>
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

  function updateDestinationAccount(transactionId: string, destinationAccountId: string) {
    commitDraft((current) =>
      current.map((transaction) => {
        if (transaction.id !== transactionId) {
          return transaction
        }

        return {
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
      }),
    )
  }

  async function handleDeleteTransaction(transactionId: string) {
    const confirmed = await confirm({
      title: "Remove transaction",
      message: "Remove this transaction from the draft ledger? It will only be deleted after you save changes.",
      confirmLabel: "Remove",
      variant: "destructive",
    })

    if (!confirmed) {
      return
    }

    commitDraft(
      (current) => current.filter((transaction) => transaction.id !== transactionId),
      { clearExpandedTransactionId: transactionId },
    )
    showSnackbar({ message: "Transaction removed from draft.", tone: "success" })
  }

  function handleUndo() {
    if (!canUndo) {
      return
    }

    const nextIndex = historyIndex - 1
    setHistoryIndex(nextIndex)
    setDraftTransactions(cloneTransactions(history[nextIndex]))
  }

  function handleRedo() {
    if (!canRedo) {
      return
    }

    const nextIndex = historyIndex + 1
    setHistoryIndex(nextIndex)
    setDraftTransactions(cloneTransactions(history[nextIndex]))
  }

  async function handleSaveChanges() {
    setIsSavingChanges(true)

    try {
      const savedById = new Map(savedTransactions.map((transaction) => [transaction.id, transaction]))
      const draftById = new Map(draftTransactions.map((transaction) => [transaction.id, transaction]))

      for (const transaction of draftTransactions) {
        const savedSnapshot = savedById.get(transaction.id)
        if (savedSnapshot && serializeTransaction(savedSnapshot) === serializeTransaction(transaction)) {
          continue
        }

        await updateTransaction(transaction.id, {
          description: transaction.description,
          referenceNumber: transaction.referenceNumber,
          splits: transaction.splits.map((split) => ({
            id: split.id,
            accountId: split.accountId,
            amount: split.amount,
            memo: split.memo,
          })),
        })
      }

      for (const transaction of savedTransactions) {
        if (!draftById.has(transaction.id)) {
          await deleteTransaction(transaction.id)
        }
      }

      setSavedTransactions(cloneTransactions(draftTransactions))
      setHistory([cloneTransactions(draftTransactions)])
      setHistoryIndex(0)
      showSnackbar({ message: "Ledger changes saved.", tone: "success" })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to save ledger changes.",
        tone: "error",
      })
    } finally {
      setIsSavingChanges(false)
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

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Landmark className="size-4.5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold leading-tight">{resolvedAccount.name}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{accountPath}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              Account type: {formatAccountType(resolvedAccount.accountType)}
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="rounded-xl border bg-background/70 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ReceiptText className="size-3.5" />
                <span>Entries</span>
              </div>
              <p className="mt-1 text-base font-semibold leading-tight">{transactionRows.length}</p>
            </div>
            <div className="rounded-xl border bg-background/70 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Scale className="size-3.5" />
                <span>Current balance</span>
              </div>
              <p className="mt-1 text-base font-semibold leading-tight">{formatNumber(currentBalance)}</p>
            </div>
            <div className="rounded-xl border bg-background/70 px-3 py-2">
              <p className="text-xs text-muted-foreground">Under account</p>
              <p className="mt-1 text-sm font-semibold leading-tight">
                {getParentAccountName(resolvedAccount.parentAccountId, accounts) ?? "Top level"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Ledger activity</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Transactions are filtered to this account and show the matching split amount with
                counterpart accounts.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Edits, split changes, and deletions stay in draft until you press Save changes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={!canUndo || isSavingChanges}
              >
                <Undo2 />
                Undo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRedo}
                disabled={!canRedo || isSavingChanges}
              >
                <Redo2 />
                Redo
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSaveChanges()}
                disabled={!hasUnsavedChanges || isSavingChanges}
              >
                <Save />
                {isSavingChanges ? "Saving..." : "Save changes"}
              </Button>
              <div className="text-sm text-muted-foreground">
                {transactionRows.length} entr{transactionRows.length === 1 ? "y" : "ies"}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rows</span>
                <Select value={String(rowsPerPage)} onValueChange={(value) => setRowsPerPage(Number(value) as 10 | 25 | 50)}>
                  <SelectTrigger className="h-9 w-[5.5rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAllRows((current) => !current)}
              >
                {showAllRows ? "Use pages" : "Show all"}
              </Button>
            </div>
          </div>

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
            <>
              <div data-horizontal-scroll-region className="horizontal-scroll-region mt-6 rounded-2xl border">
                <table className="min-w-[68rem] w-full border-collapse text-[11px] sm:text-xs lg:table-fixed">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="w-24 border-b pl-9 pr-2 py-2 text-left font-medium sm:w-28 sm:pl-12 sm:pr-3">Date</th>
                    <th className="w-[13rem] border-b px-2 py-2 text-left font-medium sm:w-[15rem]">Description</th>
                    <th className="w-24 border-b px-2 py-2 text-left font-medium sm:w-28">Reference</th>
                    <th className="w-[16rem] border-b px-2 py-2 text-left font-medium sm:w-[20rem] lg:w-[22rem]">Destination</th>
                    <th className="w-28 border-b px-2 py-2 text-left font-medium sm:w-32">Memo</th>
                    <th className="w-28 border-b px-2 py-2 text-right font-medium sm:w-32 sm:px-3">Amount</th>
                    <th className="w-32 border-b px-2 py-2 text-right font-medium sm:w-36 sm:px-3">Trailing Balance</th>
                    <th className="w-14 border-b px-2 py-2 text-right font-medium sm:w-16 sm:px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTransactionRows.map(({ transaction, accountSplit, destinationSplit, counterpartNames, trailingBalance }, rowIndex) => (
                    <Fragment key={transaction.id}>
                      <tr className={rowIndex % 2 === 0 ? "bg-muted/10" : "bg-muted/35"}>
                        <td className="border-t px-2 py-2 align-top whitespace-nowrap sm:px-3">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-6 shrink-0 sm:size-7"
                              onClick={() => toggleExpanded(transaction.id)}
                              aria-label={
                                expandedTransactionIds.has(transaction.id)
                                  ? "Hide transaction splits"
                                  : "Show transaction splits"
                              }
                            >
                              <ChevronRight
                                className={`size-3.5 transition ${
                                  expandedTransactionIds.has(transaction.id) ? "rotate-90" : ""
                                }`}
                              />
                            </Button>
                            <span>{formatDate(transaction.transactionDate)}</span>
                          </div>
                        </td>
                        <td className="border-t px-2 py-2 align-top">
                          <textarea
                            value={transaction.description}
                            onChange={(event) =>
                              {
                                updateTransactionField(transaction.id, "description", event.target.value)
                                resizeDescription(event.currentTarget)
                              }
                            }
                            placeholder="Transaction description"
                            className={`${inlineTextareaClassName} min-h-[2.25rem] break-words whitespace-pre-wrap`}
                            rows={1}
                            ref={(element) => {
                              if (element) {
                                resizeDescription(element)
                              }
                            }}
                          />
                        </td>
                        <td className="border-t px-2 py-2 align-top">
                          <textarea
                            value={transaction.referenceNumber ?? ""}
                            onChange={(event) =>
                              updateTransactionField(
                                transaction.id,
                                "referenceNumber",
                                event.target.value,
                              )
                            }
                            placeholder="Reference"
                            className={`${inlineTextareaClassName} min-h-[2.25rem]`}
                            rows={1}
                          />
                        </td>
                        <td className="border-t px-2 py-2 align-top min-w-0">
                          {destinationSplit ? (
                            <AccountSearchSelect
                              accounts={availableDestinationAccounts}
                              value={destinationSplit.accountId}
                              onValueChange={(value) =>
                                value ? updateDestinationAccount(transaction.id, value) : undefined
                              }
                              placeholder="Select destination account"
                              className="w-full min-w-0"
                              triggerClassName="h-8 px-1.5 text-xs"
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
                        <td className="border-t px-2 py-2 align-top">
                          <textarea
                            value={accountSplit?.memo ?? ""}
                            onChange={(event) => updateTransactionMemo(transaction.id, event.target.value)}
                            placeholder="Memo"
                            className={`${inlineTextareaClassName} min-h-[2.25rem]`}
                            rows={1}
                          />
                        </td>
                        <td className={`border-t px-2 py-2 text-right align-top font-medium tabular-nums whitespace-nowrap sm:px-3 ${getAmountToneClass(accountSplit?.amount ?? 0)}`}>
                          {formatSignedNumber(accountSplit?.amount ?? 0, formatNumber)}
                        </td>
                        <td className="border-t px-2 py-2 text-right align-top font-medium tabular-nums whitespace-nowrap text-muted-foreground sm:px-3">
                          {formatNumber(trailingBalance)}
                        </td>
                        <td className="border-t px-2 py-2 text-right align-top sm:px-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 text-destructive sm:size-7"
                            onClick={() => void handleDeleteTransaction(transaction.id)}
                            disabled={isSavingChanges}
                            aria-label="Delete transaction"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                      {expandedTransactionIds.has(transaction.id) ? (
                        <>
                          <tr className={rowIndex % 2 === 0 ? "bg-muted/45" : "bg-muted/60"}>
                            <td className="border-t px-3 py-3" colSpan={8}>
                              <div className="rounded-xl border border-border/70 bg-background/55 shadow-sm">
                                <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                    Split breakdown
                                  </h4>
                                  <span className="text-[11px] text-muted-foreground">
                                    {transaction.splits.length} split{transaction.splits.length === 1 ? "" : "s"}
                                  </span>
                                </div>
                                <div data-horizontal-scroll-region className="horizontal-scroll-region">
                                  {orderSplitsForDisplay(transaction.splits, resolvedAccount.id).map((split, splitIndex) => (
                                    <div
                                      key={split.id}
                                      className={`grid min-w-[40rem] grid-cols-[auto_minmax(10rem,1.3fr)_minmax(8rem,1fr)_auto_7.5rem] items-center gap-x-2 border-t px-2 py-2 text-[11px] first:border-t-0 sm:min-w-[46rem] sm:grid-cols-[auto_minmax(12rem,1.4fr)_minmax(10rem,1.1fr)_auto_8rem] sm:px-3 sm:text-xs ${
                                        splitIndex % 2 === 0 ? "bg-background/35" : "bg-background/20"
                                      }`}
                                    >
                                      <div className="pr-1 text-[11px] text-muted-foreground">Account</div>
                                      <div>
                                        <AccountSearchSelect
                                          accounts={accounts}
                                          value={split.accountId}
                                          onValueChange={(value) => {
                                            if (!value) {
                                              return
                                            }

                                            updateSplitAccount(transaction.id, split.id, value)
                                          }}
                                          className="w-full min-w-0"
                                          triggerClassName="h-8 px-1.5 text-xs"
                                          getAccountLabel={(account) =>
                                            accountPathLookup.get(account.id) ?? account.name
                                          }
                                        />
                                      </div>
                                      <div>
                                        <textarea
                                          value={split.memo ?? ""}
                                          onChange={(event) =>
                                            updateSplitField(
                                              transaction.id,
                                              split.id,
                                              "memo",
                                              event.target.value,
                                            )
                                          }
                                          placeholder="Memo"
                                          className={`${inlineTextareaClassName} min-h-[2.25rem]`}
                                          rows={1}
                                        />
                                      </div>
                                      <div className="pr-1 text-[11px] text-muted-foreground">Amount</div>
                                      <div className={getAmountToneClass(split.amount)}>
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
                                          className={`${inlineNumberInputClassName} ${getAmountToneClass(split.amount)}`}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        </>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="mt-4 rounded-2xl border bg-background/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Ledger pages</p>
                    <p className="text-xs text-muted-foreground">
                      {showAllRows
                        ? `Showing all ${transactionRows.length} entries`
                        : `Showing ${transactionRows.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}-${Math.min(currentPage * rowsPerPage, transactionRows.length)} of ${transactionRows.length} entries`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
                      {showAllRows ? "All rows" : `Page ${currentPage} / ${totalPages}`}
                    </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                    disabled={showAllRows || currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
                    disabled={showAllRows || currentPage === totalPages}
                  >
                    Next
                  </Button>
                  </div>
                </div>
              </div>
            </>
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

function cloneTransactions(transactions: Transaction[]) {
  return transactions.map((transaction) => ({
    ...transaction,
    splits: transaction.splits.map((split) => ({ ...split })),
  }))
}

function serializeTransaction(transaction: Transaction) {
  return JSON.stringify(transaction)
}

function serializeTransactions(transactions: Transaction[]) {
  return JSON.stringify(transactions)
}

function getAmountToneClass(amount: number) {
  if (amount > 0) {
    return "text-emerald-600 dark:text-emerald-400"
  }

  if (amount < 0) {
    return "text-rose-600 dark:text-rose-400"
  }

  return "text-muted-foreground"
}

function formatSignedNumber(
  value: number,
  formatNumber: (value: number, fractionDigits?: number) => string,
) {
  if (value > 0) {
    return `+${formatNumber(value)}`
  }

  return formatNumber(value)
}

function orderSplitsForDisplay(
  splits: Transaction["splits"],
  selectedAccountId: string,
) {
  return [...splits].sort((left, right) => {
    const leftRank = left.accountId === selectedAccountId ? 0 : 1
    const rightRank = right.accountId === selectedAccountId ? 0 : 1

    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    return 0
  })
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
