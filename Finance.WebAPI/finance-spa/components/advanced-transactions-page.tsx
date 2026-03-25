"use client"

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDownUp, ChevronDown, Redo2, Save, Trash2, Undo2, X } from "lucide-react"

import { AccountSearchSelect } from "@/components/account-search-select"
import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider"
import { useImportSessions } from "@/components/providers/import-sessions-provider"
import { useSnackbar } from "@/components/providers/snackbar-provider"
import { useRegisterUnsavedChanges } from "@/components/providers/unsaved-changes-provider"
import { useUserPreferences } from "@/components/providers/user-preferences-provider"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { buildAccountTree } from "@/lib/accounts"
import { deleteTransaction, getTransactions, updateTransaction } from "@/lib/transactions"
import { cn } from "@/lib/utils"
import type { AccountNode } from "@/models/account"
import type { Transaction } from "@/models/transaction"

type SortKey =
  | "transactionDate"
  | "description"
  | "referenceNumber"
  | "splitCount"
  | "debitTotal"
  | "creditTotal"

type SortDirection = "asc" | "desc"

type SortState = {
  key: SortKey
  direction: SortDirection
}

type ImportSessionFilter = "all" | "archived" | "active" | "none"

type TransactionImportSessionStatus = "archived" | "active"

type HiddenColumn = "splitCount" | "splitTotal"

const defaultSort: SortState = {
  key: "transactionDate",
  direction: "desc",
}

const inlineTextareaClassName =
  "min-h-10 w-full resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-1.5 text-xs leading-5 outline-none focus-visible:ring-0"

export function AdvancedTransactionsPage() {
  const { accounts, isLoading: isLoadingAccounts, errorMessage: accountsErrorMessage } = useAccounts()
  const { sessions, errorMessage: importSessionsErrorMessage } = useImportSessions()
  const { showSnackbar } = useSnackbar()
  const { confirm } = useConfirmationDialog()
  const { formatNumber } = useUserPreferences()
  const [savedTransactions, setSavedTransactions] = useState<Transaction[]>([])
  const [draftTransactions, setDraftTransactions] = useState<Transaction[]>([])
  const [history, setHistory] = useState<Transaction[][]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true)
  const [transactionsErrorMessage, setTransactionsErrorMessage] = useState<string | null>(null)
  const [isAccountPopupOpen, setIsAccountPopupOpen] = useState(false)
  const accountPopupRef = useRef<HTMLDivElement | null>(null)
  const [accountQuery, setAccountQuery] = useState("")
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set())
  const [bulkTargetAccountId, setBulkTargetAccountId] = useState<string | null>(null)
  const [descriptionQuery, setDescriptionQuery] = useState("")
  const [memoQuery, setMemoQuery] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [importSessionFilter, setImportSessionFilter] = useState<ImportSessionFilter>("all")
  const [selectedArchivedSessionIds, setSelectedArchivedSessionIds] = useState<Set<string>>(new Set())
  const [sortState, setSortState] = useState<SortState>(defaultSort)
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSavingChanges, setIsSavingChanges] = useState(false)
  const [hiddenColumns, setHiddenColumns] = useState<Set<HiddenColumn>>(new Set())
  const deferredDescriptionQuery = useDeferredValue(descriptionQuery)
  const deferredMemoQuery = useDeferredValue(memoQuery)
  const deferredAccountQuery = useDeferredValue(accountQuery)

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

  const accountTree = useMemo(() => buildAccountTree(accounts), [accounts])
  const filteredAccountTree = useMemo(
    () => filterAccountTree(accountTree, deferredAccountQuery.trim().toLowerCase()),
    [accountTree, deferredAccountQuery],
  )

  const archivedSessions = useMemo(
    () => sessions.filter((session) => session.isArchived),
    [sessions],
  )

  const importSessionMetaByTransactionId = useMemo(() => {
    const metaByTransactionId = new Map<
      string,
      {
        status: TransactionImportSessionStatus
        sessionIds: Set<string>
      }
    >()

    sessions.forEach((session) => {
      session.rows.forEach((row) => {
        if (!row.postedTransactionId) {
          return
        }

        const current = metaByTransactionId.get(row.postedTransactionId) ?? {
          status: session.isArchived ? "archived" : "active",
          sessionIds: new Set<string>(),
        }

        current.sessionIds.add(session.id)

        if (session.isArchived) {
          current.status = "archived"
        }

        metaByTransactionId.set(row.postedTransactionId, current)
      })
    })

    return metaByTransactionId
  }, [sessions])

  useEffect(() => {
    let isCancelled = false

    async function loadTransactions() {
      setIsLoadingTransactions(true)

      try {
        const nextTransactions = await getTransactions()

        if (isCancelled) {
          return
        }

        setSavedTransactions(nextTransactions)
        setDraftTransactions(nextTransactions)
        setHistory([cloneTransactions(nextTransactions)])
        setHistoryIndex(0)
        setTransactionsErrorMessage(null)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setSavedTransactions([])
        setDraftTransactions([])
        setHistory([])
        setHistoryIndex(-1)
        setTransactionsErrorMessage(
          error instanceof Error ? error.message : "Failed to load transactions.",
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
  }, [])

  useEffect(() => {
    if (!isAccountPopupOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const popup = accountPopupRef.current
      if (!popup) {
        return
      }

      if (!popup.contains(event.target as Node)) {
        setIsAccountPopupOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAccountPopupOpen(false)
      }
    }

    window.addEventListener("mousedown", handlePointerDown)
    window.addEventListener("keydown", handleEscape)

    return () => {
      window.removeEventListener("mousedown", handlePointerDown)
      window.removeEventListener("keydown", handleEscape)
    }
  }, [isAccountPopupOpen])

  const filteredTransactions = useMemo(() => {
    const normalizedDescription = deferredDescriptionQuery.trim().toLowerCase()
    const normalizedMemo = deferredMemoQuery.trim().toLowerCase()

    return draftTransactions.filter((transaction) => {
      const transactionDate = getComparableDateValue(transaction.transactionDate)

      if (dateFrom) {
        const fromDate = new Date(`${dateFrom}T00:00:00`)
        if (Number.isFinite(transactionDate) && transactionDate < fromDate.getTime()) {
          return false
        }
      }

      if (dateTo) {
        const toDate = new Date(`${dateTo}T23:59:59.999`)
        if (Number.isFinite(transactionDate) && transactionDate > toDate.getTime()) {
          return false
        }
      }

      if (
        normalizedDescription &&
        !`${transaction.description} ${transaction.referenceNumber ?? ""}`
          .toLowerCase()
          .includes(normalizedDescription)
      ) {
        return false
      }

      if (
        normalizedMemo &&
        !transaction.splits.some((split) => (split.memo ?? "").toLowerCase().includes(normalizedMemo))
      ) {
        return false
      }

      if (
        selectedAccountIds.size > 0 &&
        !transaction.splits.some((split) => selectedAccountIds.has(split.accountId))
      ) {
        return false
      }

      const importSessionMeta = importSessionMetaByTransactionId.get(transaction.id)
      const importSessionStatus = importSessionMeta?.status ?? "none"

      if (importSessionFilter !== "all" && importSessionStatus !== importSessionFilter) {
        return false
      }

      if (
        importSessionFilter === "archived" &&
        selectedArchivedSessionIds.size > 0 &&
        ![...selectedArchivedSessionIds].some((sessionId) => importSessionMeta?.sessionIds.has(sessionId))
      ) {
        return false
      }

      return true
    })
  }, [
    dateFrom,
    dateTo,
    deferredDescriptionQuery,
    deferredMemoQuery,
    draftTransactions,
    importSessionFilter,
    importSessionMetaByTransactionId,
    selectedAccountIds,
    selectedArchivedSessionIds,
  ])

  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((left, right) => {
      const comparison = compareTransactions(left, right, sortState)

      if (comparison !== 0) {
        return comparison
      }

      return right.createdAt.localeCompare(left.createdAt)
    })
  }, [filteredTransactions, sortState])

  const transactionDateRange = useMemo(() => {
    if (draftTransactions.length === 0) {
      return { earliest: "", latest: "" }
    }

    const sortedDates = draftTransactions
      .map((transaction) => transaction.transactionDate)
      .map((value) => {
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? null : date
      })
      .filter((value): value is Date => value != null)
      .sort((left, right) => left.getTime() - right.getTime())

    if (sortedDates.length === 0) {
      return { earliest: "", latest: "" }
    }

    return {
      earliest: sortedDates[0].toISOString().slice(0, 10),
      latest: sortedDates[sortedDates.length - 1].toISOString().slice(0, 10),
    }
  }, [draftTransactions])

  const visibleTransactionIds = useMemo(
    () => sortedTransactions.map((transaction) => transaction.id),
    [sortedTransactions],
  )
  const visibleSelectionCount = visibleTransactionIds.filter((id) => selectedTransactionIds.has(id)).length
  const areAllVisibleSelected =
    visibleTransactionIds.length > 0 && visibleSelectionCount === visibleTransactionIds.length

  useEffect(() => {
    setSelectedTransactionIds((current) => {
      const next = new Set<string>()

      current.forEach((id) => {
        if (draftTransactions.some((transaction) => transaction.id === id)) {
          next.add(id)
        }
      })

      return next
    })
  }, [draftTransactions])

  const hasUnsavedChanges = useMemo(
    () => serializeTransactions(savedTransactions) !== serializeTransactions(draftTransactions),
    [draftTransactions, savedTransactions],
  )
  const canUndo = historyIndex > 0
  const canRedo = historyIndex >= 0 && historyIndex < history.length - 1

  function commitDraft(updater: (current: Transaction[]) => Transaction[]) {
    setDraftTransactions((current) => {
      const next = updater(current)
      const nextHistory = history.slice(0, historyIndex + 1)
      nextHistory.push(cloneTransactions(next))
      setHistory(nextHistory)
      setHistoryIndex(nextHistory.length - 1)
      return next
    })
  }

  async function handleDeleteSelected() {
    if (selectedTransactionIds.size === 0) {
      return
    }

    const confirmed = await confirm({
      title: "Remove selected transactions",
      message: `Delete ${selectedTransactionIds.size} selected transaction${
        selectedTransactionIds.size === 1 ? "" : "s"
      } from the draft? They will be deleted after you save changes.`,
      confirmLabel: "Remove",
      variant: "destructive",
    })

    if (!confirmed) {
      return
    }

    setIsDeleting(true)

    try {
      commitDraft((current) =>
        current.filter((transaction) => !selectedTransactionIds.has(transaction.id)),
      )
      setSelectedTransactionIds(new Set())
      showSnackbar({
        message: `Delete action queued: ${selectedTransactionIds.size} transaction${
          selectedTransactionIds.size === 1 ? "" : "s"
        } removed from draft.`,
        tone: "success",
      })
    } catch (error) {
      showSnackbar({
        message:
          error instanceof Error
            ? `Delete action failed: ${error.message}`
            : "Delete action failed: unable to update the draft.",
        tone: "error",
      })
    } finally {
      setIsDeleting(false)
    }
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

  const saveChanges = useCallback(async () => {
    const changedTransactionCount = draftTransactions.reduce((count, transaction) => {
      const savedSnapshot = savedTransactions.find((item) => item.id === transaction.id)
      return count + (!savedSnapshot || serializeTransaction(savedSnapshot) !== serializeTransaction(transaction) ? 1 : 0)
    }, 0)
    const deletedTransactionCount = savedTransactions.filter(
      (transaction) => !draftTransactions.some((draft) => draft.id === transaction.id),
    ).length

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
      showSnackbar({
        message: `Save completed: ${changedTransactionCount} edited, ${deletedTransactionCount} deleted.`,
        tone: "success",
      })
      return true
    } catch (error) {
      showSnackbar({
        message:
          error instanceof Error
            ? `Save failed: ${error.message}`
            : "Save failed: unable to persist transaction changes.",
        tone: "error",
      })
      return false
    } finally {
      setIsSavingChanges(false)
    }
  }, [draftTransactions, savedTransactions, showSnackbar])
  useRegisterUnsavedChanges("advanced-transactions", hasUnsavedChanges, saveChanges)

  async function handleSaveChanges() {
    const changedTransactionCount = draftTransactions.reduce((count, transaction) => {
      const savedSnapshot = savedTransactions.find((item) => item.id === transaction.id)
      return count + (!savedSnapshot || serializeTransaction(savedSnapshot) !== serializeTransaction(transaction) ? 1 : 0)
    }, 0)
    const deletedTransactionCount = savedTransactions.filter(
      (transaction) => !draftTransactions.some((draft) => draft.id === transaction.id),
    ).length

    const confirmed = await confirm({
      title: "Save advanced filter changes",
      message: `Save ${changedTransactionCount} edited transaction${
        changedTransactionCount === 1 ? "" : "s"
      } and ${deletedTransactionCount} deleted transaction${
        deletedTransactionCount === 1 ? "" : "s"
      }?`,
      confirmLabel: "Save changes",
    })

    if (!confirmed) {
      return
    }

    await saveChanges()
  }

  function toggleTransactionSelection(transactionId: string, checked: boolean) {
    setSelectedTransactionIds((current) => {
      const next = new Set(current)

      if (checked) {
        next.add(transactionId)
      } else {
        next.delete(transactionId)
      }

      return next
    })
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedTransactionIds((current) => {
      const next = new Set(current)

      visibleTransactionIds.forEach((id) => {
        if (checked) {
          next.add(id)
        } else {
          next.delete(id)
        }
      })

      return next
    })
  }

  function handleSort(nextKey: SortKey) {
    setSortState((current) =>
      current.key === nextKey
        ? {
            key: nextKey,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : {
            key: nextKey,
            direction: nextKey === "description" || nextKey === "referenceNumber" ? "asc" : "desc",
          },
    )
  }

  const debitSum = sortedTransactions.reduce((sum, transaction) => sum + getDebitTotal(transaction), 0)
  const creditSum = sortedTransactions.reduce((sum, transaction) => sum + getCreditTotal(transaction), 0)
  const selectedArchivedCount = selectedArchivedSessionIds.size
  const selectedAccountCount = selectedAccountIds.size
  const showSplitCountColumn = !hiddenColumns.has("splitCount")
  const showSplitTotalColumn = !hiddenColumns.has("splitTotal")
  const isBulkChangeDisabled =
    selectedTransactionIds.size === 0 ||
    !bulkTargetAccountId ||
    selectedAccountIds.size === 0 ||
    selectedAccountIds.has(bulkTargetAccountId)
  const bulkChangeDisabledReason =
    selectedAccountIds.size === 0
      ? "Account selection is required."
      : selectedTransactionIds.size === 0
        ? "Select at least one transaction."
        : !bulkTargetAccountId
          ? "Choose the replacement account."
          : selectedAccountIds.has(bulkTargetAccountId)
            ? "Replacement account must differ from the selected source account."
            : null

  function toggleHiddenColumn(column: HiddenColumn, checked: boolean) {
    setHiddenColumns((current) => {
      const next = new Set(current)

      if (checked) {
        next.delete(column)
      } else {
        next.add(column)
      }

      return next
    })
  }

  async function handleBulkSourceAccountChange() {
    if (selectedAccountIds.size === 0 || !bulkTargetAccountId || selectedAccountIds.has(bulkTargetAccountId)) {
      return
    }

    const confirmed = await confirm({
      title: "Apply bulk source account change",
      message: `Replace the selected source account filter in ${selectedTransactionIds.size} selected transaction${
        selectedTransactionIds.size === 1 ? "" : "s"
      } with the chosen replacement account?`,
      confirmLabel: "Apply change",
    })

    if (!confirmed) {
      return
    }

    let changedSplitCount = 0

    commitDraft((current) =>
      current.map((transaction) => {
        if (!selectedTransactionIds.has(transaction.id)) {
          return transaction
        }

        let transactionChanged = false
        const nextSplits = transaction.splits.map((split) => {
          if (!selectedAccountIds.has(split.accountId)) {
            return split
          }

          changedSplitCount += 1
          transactionChanged = true

          return {
            ...split,
            accountId: bulkTargetAccountId,
          }
        })

        return transactionChanged
          ? {
              ...transaction,
              splits: nextSplits,
            }
          : transaction
      }),
    )

    if (changedSplitCount === 0) {
      showSnackbar({
        message: "No matching source-account splits found in the selected transactions.",
        tone: "info",
      })
      return
    }

    showSnackbar({
      message: `Updated ${changedSplitCount} source split${changedSplitCount === 1 ? "" : "s"} in the draft.`,
      tone: "success",
    })
  }

  return (
    <AppShell
      title="Advanced Filter"
      subtitle="Compact transaction and split editor"
      badge={
        isLoadingTransactions
          ? "Loading transactions"
          : `${sortedTransactions.length} of ${draftTransactions.length} transactions`
      }
    >
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-[22rem] flex-1 gap-3 sm:grid-cols-[minmax(16rem,1.7fr)_minmax(12rem,1fr)]">
            <label className="space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">Description / reference</span>
              <Input
                value={descriptionQuery}
                onChange={(event) => setDescriptionQuery(event.target.value)}
                placeholder="Description or reference"
                className="h-8"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">Memo search</span>
              <Input
                value={memoQuery}
                onChange={(event) => setMemoQuery(event.target.value)}
                placeholder="Split memo"
                className="h-8"
              />
            </label>
          </div>

          <div ref={accountPopupRef} className="relative min-w-[14rem] flex-1 space-y-1 text-xs md:max-w-[18rem]">
            <span className="font-medium text-muted-foreground">Accounts</span>
            <button
              type="button"
              onClick={() => setIsAccountPopupOpen((current) => !current)}
              className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-background px-2.5 text-left text-xs hover:bg-muted"
              disabled={isLoadingAccounts}
            >
              <span className="truncate">
                {selectedAccountCount === 0
                  ? "All accounts"
                  : `${selectedAccountCount} account${selectedAccountCount === 1 ? "" : "s"} selected`}
              </span>
              <ChevronDown className={cn("size-4 opacity-60 transition", isAccountPopupOpen && "rotate-180")} />
            </button>

            {isAccountPopupOpen ? (
              <div className="absolute left-0 top-full z-30 mt-2 w-[28rem] max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
                <div className="relative">
                  <Input
                    value={accountQuery}
                    onChange={(event) => setAccountQuery(event.target.value)}
                    placeholder="Search accounts"
                    className="h-8 pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setAccountQuery("")}
                    disabled={accountQuery.length === 0}
                    aria-label="Clear account search"
                    className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    Compact tree multi-select
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedAccountIds(new Set())}
                    disabled={selectedAccountCount === 0}
                  >
                    Clear all
                  </Button>
                </div>
                <div className="mt-2 max-h-72 overflow-y-auto pr-1">
                  {filteredAccountTree.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground">No accounts match.</p>
                  ) : (
                    <AccountTreeMultiSelect
                      nodes={filteredAccountTree}
                      selectedAccountIds={selectedAccountIds}
                      onToggle={(accountId, checked) =>
                        setSelectedAccountIds((current) => {
                          const next = new Set(current)

                          if (checked) {
                            next.add(accountId)
                          } else {
                            next.delete(accountId)
                          }

                          return next
                        })
                      }
                    />
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <label className="min-w-[10rem] space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">From</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              min={transactionDateRange.earliest || undefined}
              max={transactionDateRange.latest || undefined}
              className="h-8"
            />
          </label>

          <label className="min-w-[10rem] space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">To</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              min={transactionDateRange.earliest || undefined}
              max={transactionDateRange.latest || undefined}
              className="h-8"
            />
          </label>

          <label className="min-w-[11rem] space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Import session</span>
            <Select
              value={importSessionFilter}
              onValueChange={(value) => setImportSessionFilter(value as ImportSessionFilter)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="archived">Archived sessions</SelectItem>
                <SelectItem value="active">Active sessions</SelectItem>
                <SelectItem value="none">No import session</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <div className="flex flex-wrap items-end gap-2 md:ml-auto">
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
              {isSavingChanges ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDescriptionQuery("")
                setMemoQuery("")
                setAccountQuery("")
                setIsAccountPopupOpen(false)
                setDateFrom("")
                setDateTo("")
                setImportSessionFilter("all")
                setSelectedArchivedSessionIds(new Set())
                setSelectedAccountIds(new Set())
                setSortState(defaultSort)
              }}
            >
              Reset filters
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void handleDeleteSelected()}
              disabled={selectedTransactionIds.size === 0 || isDeleting || isSavingChanges}
            >
              <Trash2 />
              {isDeleting ? "Removing..." : `Delete selected (${selectedTransactionIds.size})`}
            </Button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border bg-background/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Bulk source account change</p>
              <p className="text-xs text-muted-foreground">
                Change the currently selected source account filter to one replacement account.
                Counterpart or to accounts remain unchanged.
              </p>
            </div>
            <span className="rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground">
              {selectedTransactionIds.size} selected transaction{selectedTransactionIds.size === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-3 grid w-full max-w-[40%] min-w-[22rem] gap-3 md:grid-cols-[minmax(14rem,1fr)_auto]">
            <label className="space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">New source account</span>
              <AccountSearchSelect
                accounts={accounts}
                value={bulkTargetAccountId}
                onValueChange={setBulkTargetAccountId}
                allowEmpty
                emptyLabel="Select replacement account"
                placeholder="Select replacement account"
                getAccountLabel={(account) => accountPathLookup.get(account.id) ?? account.name}
              />
            </label>
            <div className="flex items-end">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={isBulkChangeDisabled ? 0 : -1} className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleBulkSourceAccountChange()}
                        disabled={isBulkChangeDisabled}
                      >
                        Apply bulk change
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {isBulkChangeDisabled && bulkChangeDisabledReason ? (
                    <TooltipContent side="top">{bulkChangeDisabledReason}</TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {importSessionFilter === "archived" ? (
          <div className="mt-3 rounded-xl border bg-background/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Archived sessions</p>
                <p className="text-xs text-muted-foreground">
                  {selectedArchivedCount === 0
                    ? "Showing all archived sessions"
                    : `${selectedArchivedCount} archived session${
                        selectedArchivedCount === 1 ? "" : "s"
                      } selected`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedArchivedSessionIds(new Set())}
                disabled={selectedArchivedCount === 0}
              >
                Clear session selection
              </Button>
            </div>

            {archivedSessions.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No archived import sessions found.</p>
            ) : (
              <div className="mt-3 grid max-h-40 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                {archivedSessions.map((session) => {
                  const isChecked = selectedArchivedSessionIds.has(session.id)

                  return (
                    <label
                      key={session.id}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs",
                        isChecked ? "border-primary bg-primary/5" : "bg-card",
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          setSelectedArchivedSessionIds((current) => {
                            const next = new Set(current)

                            if (checked) {
                              next.add(session.id)
                            } else {
                              next.delete(session.id)
                            }

                            return next
                          })
                        }
                        aria-label={`Select archived session ${session.id}`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {formatImportSessionDisplayName(session)}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border bg-background px-2 py-1">
            Range: {transactionDateRange.earliest || "-"} to {transactionDateRange.latest || "-"}
          </span>
          <span className="rounded-md border bg-background px-2 py-1">
            Selected: {selectedTransactionIds.size}
          </span>
          <span
            className={cn(
              "rounded-md border bg-background px-2 py-1",
              hasUnsavedChanges ? "text-amber-700 dark:text-amber-300" : "",
            )}
          >
            Draft: {hasUnsavedChanges ? "Unsaved changes" : "Saved"}
          </span>
          <span className="rounded-md border bg-background px-2 py-1">
            Debits: {formatNumber(debitSum)}
          </span>
          <span className="rounded-md border bg-background px-2 py-1">
            Credits: {formatNumber(creditSum)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={showSplitCountColumn}
              onCheckedChange={(checked) => toggleHiddenColumn("splitCount", Boolean(checked))}
              aria-label="Toggle splits column"
            />
            <span>Show splits count</span>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={showSplitTotalColumn}
              onCheckedChange={(checked) => toggleHiddenColumn("splitTotal", Boolean(checked))}
              aria-label="Toggle split total column"
            />
            <span>Show split total</span>
          </label>
        </div>

        {accountsErrorMessage ? (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {accountsErrorMessage}
          </div>
        ) : null}
        {importSessionsErrorMessage ? (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {importSessionsErrorMessage}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-card shadow-sm">
        {transactionsErrorMessage ? (
          <div className="p-4 text-sm text-destructive">{transactionsErrorMessage}</div>
        ) : isLoadingTransactions ? (
          <div className="p-6 text-sm text-muted-foreground">Loading transactions...</div>
        ) : sortedTransactions.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No transactions match the current filters.</div>
        ) : (
          <div data-horizontal-scroll-region className="horizontal-scroll-region overflow-x-auto">
            <table className="min-w-[96rem] w-full border-collapse text-xs">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="w-10 px-2 py-2 text-left">
                    <Checkbox
                      checked={areAllVisibleSelected}
                      onCheckedChange={(checked) => toggleVisibleSelection(Boolean(checked))}
                      aria-label="Select visible transactions"
                    />
                  </th>
                  <SortableHeader
                    label="Date"
                    sortKey="transactionDate"
                    sortState={sortState}
                    onSort={handleSort}
                    className="w-28"
                  />
                  <SortableHeader
                    label="Description"
                    sortKey="description"
                    sortState={sortState}
                    onSort={handleSort}
                    className="w-[30rem]"
                  />
                  <SortableHeader
                    label="Reference"
                    sortKey="referenceNumber"
                    sortState={sortState}
                    onSort={handleSort}
                    className="w-36"
                  />
                  <th className="w-[24rem] px-2 py-2 text-left font-medium">Split account</th>
                  <th className="w-16 px-2 py-2 text-left font-medium">Side</th>
                  <SortableHeader
                    label="Debits"
                    sortKey="debitTotal"
                    sortState={sortState}
                    onSort={handleSort}
                    className="w-28 text-right"
                  />
                  <SortableHeader
                    label="Credits"
                    sortKey="creditTotal"
                    sortState={sortState}
                    onSort={handleSort}
                    className="w-28 text-right"
                  />
                  <th className="w-[18rem] px-2 py-2 text-left font-medium">Memo</th>
                  {showSplitTotalColumn ? (
                    <th className="w-24 px-2 py-2 text-right font-medium">Split total</th>
                  ) : null}
                  {showSplitCountColumn ? (
                    <SortableHeader
                      label="Splits"
                      sortKey="splitCount"
                      sortState={sortState}
                      onSort={handleSort}
                      className="w-20 text-right"
                    />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sortedTransactions.map((transaction) => {
                  const isSelected = selectedTransactionIds.has(transaction.id)
                  const splitTotal = getDebitTotal(transaction)
                  const savedSnapshot = savedTransactions.find((item) => item.id === transaction.id)
                  const isModified =
                    !savedSnapshot || serializeTransaction(savedSnapshot) !== serializeTransaction(transaction)

                  return (
                    <Fragment key={transaction.id}>
                      {orderSplitsForDisplay(transaction.splits).map((split, splitIndex) => {
                        const splitAccountLabel = accountPathLookup.get(split.accountId) ?? split.accountId
                        const isDebit = split.amount < 0

                        return (
                          <tr
                            key={`${transaction.id}-${split.id}`}
                            className={cn(
                              "border-t align-top",
                              isModified
                                ? "bg-amber-50/80 dark:bg-amber-500/10"
                                : "bg-background",
                              isSelected && "ring-1 ring-primary/20",
                            )}
                          >
                            {splitIndex === 0 ? (
                              <>
                                <td className="px-2 py-2" rowSpan={transaction.splits.length}>
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) =>
                                      toggleTransactionSelection(transaction.id, Boolean(checked))
                                    }
                                    aria-label={`Select transaction ${transaction.id}`}
                                  />
                                </td>
                                <td className="px-2 py-2 whitespace-nowrap" rowSpan={transaction.splits.length}>
                                  {formatDate(transaction.transactionDate)}
                                </td>
                                <td
                                  className="px-2 py-2 whitespace-pre-wrap break-words"
                                  rowSpan={transaction.splits.length}
                                >
                                  <textarea
                                    value={transaction.description}
                                    onChange={(event) =>
                                      updateTransactionField(
                                        transaction.id,
                                        "description",
                                        event.target.value,
                                        commitDraft,
                                      )
                                    }
                                    className={inlineTextareaClassName}
                                    rows={1}
                                    placeholder="Description"
                                  />
                                </td>
                                <td className="px-2 py-2 break-all" rowSpan={transaction.splits.length}>
                                  <textarea
                                    value={transaction.referenceNumber ?? ""}
                                    onChange={(event) =>
                                      updateTransactionField(
                                        transaction.id,
                                        "referenceNumber",
                                        event.target.value,
                                        commitDraft,
                                      )
                                    }
                                    className={inlineTextareaClassName}
                                    rows={1}
                                    placeholder="Reference"
                                  />
                                </td>
                              </>
                            ) : null}

                            <td className="px-2 py-2 break-words">{splitAccountLabel}</td>
                            <td
                              className={cn(
                                "px-2 py-2 font-medium uppercase",
                                isDebit ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
                              )}
                            >
                              {isDebit ? "Dr" : "Cr"}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {isDebit ? (
                                <span className="text-rose-600 dark:text-rose-400">
                                  {formatNumber(Math.abs(split.amount))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {!isDebit ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {formatNumber(split.amount)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="px-2 py-2 whitespace-pre-wrap break-words">
                              <textarea
                                value={split.memo ?? ""}
                                onChange={(event) =>
                                  updateSplitMemo(transaction.id, split.id, event.target.value, commitDraft)
                                }
                                className={inlineTextareaClassName}
                                rows={1}
                                placeholder="Memo"
                              />
                            </td>

                            {splitIndex === 0 && showSplitTotalColumn ? (
                              <td
                                className="px-2 py-2 text-right font-medium tabular-nums"
                                rowSpan={transaction.splits.length}
                              >
                                {formatNumber(splitTotal)}
                              </td>
                            ) : null}

                            {splitIndex === 0 && showSplitCountColumn ? (
                              <td
                                className="px-2 py-2 text-right font-medium tabular-nums"
                                rowSpan={transaction.splits.length}
                              >
                                {transaction.splits.length}
                              </td>
                            ) : null}
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  )
}

function updateTransactionField(
  transactionId: string,
  field: "description" | "referenceNumber",
  value: string,
  commitDraft: (updater: (current: Transaction[]) => Transaction[]) => void,
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

function updateSplitMemo(
  transactionId: string,
  splitId: string,
  memo: string,
  commitDraft: (updater: (current: Transaction[]) => Transaction[]) => void,
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
                    memo: memo.trim() ? memo : null,
                  },
            ),
          },
    ),
  )
}

function formatImportSessionDisplayName(session: {
  fileName: string | null
  label: string
}) {
  return session.fileName?.trim() || formatImportSessionLabel(session.label)
}

function formatImportSessionLabel(label: string) {
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

function AccountTreeMultiSelect({
  nodes,
  selectedAccountIds,
  onToggle,
  depth = 0,
}: {
  nodes: AccountNode[]
  selectedAccountIds: Set<string>
  onToggle: (accountId: string, checked: boolean) => void
  depth?: number
}) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => {
        const isChecked = selectedAccountIds.has(node.id)

        return (
          <div key={node.id}>
            <label
              className={cn(
                "flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/60",
                isChecked && "bg-primary/5",
              )}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(checked) => onToggle(node.id, Boolean(checked))}
                aria-label={`Select account ${node.name}`}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{node.name}</span>
              </span>
            </label>
            {node.children.length > 0 ? (
              <AccountTreeMultiSelect
                nodes={node.children}
                selectedAccountIds={selectedAccountIds}
                onToggle={onToggle}
                depth={depth + 1}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function filterAccountTree(nodes: AccountNode[], searchTerm: string): AccountNode[] {
  if (!searchTerm) {
    return nodes
  }

  function visit(node: AccountNode): AccountNode | null {
    const filteredChildren = node.children
      .map((child) => visit(child))
      .filter((child): child is AccountNode => child != null)
    const matchesSelf = node.name.toLowerCase().includes(searchTerm)
    const hasMatchingDescendant = filteredChildren.length > 0

    if (!matchesSelf && !hasMatchingDescendant) {
      return null
    }

    return {
      ...node,
      children: filteredChildren,
    }
  }

  return nodes
    .map((node) => visit(node))
    .filter((node): node is AccountNode => node != null)
}

function SortableHeader({
  label,
  sortKey,
  sortState,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  sortState: SortState
  onSort: (sortKey: SortKey) => void
  className?: string
}) {
  const isActive = sortState.key === sortKey

  return (
    <th className={cn("px-2 py-2 text-left font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 text-inherit hover:text-foreground"
      >
        <span>{label}</span>
        <ArrowDownUp className="size-3.5 opacity-55" />
        {isActive ? (
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              sortState.direction === "asc" ? "rotate-180" : "",
            )}
          />
        ) : null}
      </button>
    </th>
  )
}

function compareTransactions(left: Transaction, right: Transaction, sortState: SortState) {
  const direction = sortState.direction === "asc" ? 1 : -1

  switch (sortState.key) {
    case "transactionDate":
      return (
        (getComparableDateValue(left.transactionDate) - getComparableDateValue(right.transactionDate)) *
        direction
      )
    case "description":
      return compareStrings(left.description, right.description) * direction
    case "referenceNumber":
      return compareStrings(left.referenceNumber ?? "", right.referenceNumber ?? "") * direction
    case "splitCount":
      return (left.splits.length - right.splits.length) * direction
    case "debitTotal":
      return (getDebitTotal(left) - getDebitTotal(right)) * direction
    case "creditTotal":
      return (getCreditTotal(left) - getCreditTotal(right)) * direction
    default:
      return 0
  }
}

function compareStrings(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true })
}

function getComparableDateValue(value: string) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getDebitTotal(transaction: Transaction) {
  return transaction.splits.reduce(
    (sum, split) => sum + (split.amount < 0 ? Math.abs(split.amount) : 0),
    0,
  )
}

function getCreditTotal(transaction: Transaction) {
  return transaction.splits.reduce((sum, split) => sum + (split.amount > 0 ? split.amount : 0), 0)
}

function orderSplitsForDisplay(transactionSplits: Transaction["splits"]) {
  return [...transactionSplits].sort((left, right) => left.amount - right.amount)
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
