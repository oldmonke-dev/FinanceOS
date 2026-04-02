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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
  getCreditTotal as getSplitCreditTotal,
  getDebitTotal as getSplitDebitTotal,
  getSignedSplitAmount,
} from "@/lib/accounting"
import { buildAccountTree } from "@/lib/accounts"
import { getTransactionDateKey, isTransactionDateInRange, parseDateKeyToLocalDate } from "@/lib/transaction-date"
import { deleteTransaction, getTransactions, updateTransaction } from "@/lib/transactions"
import { cn } from "@/lib/utils"
import type { Account, AccountNode } from "@/models/account"
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
type DateRangeMode = "custom" | "fy" | "ay"

type TransactionImportSessionStatus = "archived" | "active"

type HiddenColumn = "splitCount" | "splitTotal"
type ReorderMode = {
  accountId: string
  date: string
}

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
  const [collapsedAccountIds, setCollapsedAccountIds] = useState<Set<string>>(new Set())
  const [bulkTargetAccountId, setBulkTargetAccountId] = useState<string | null>(null)
  const [descriptionQuery, setDescriptionQuery] = useState("")
  const [memoQuery, setMemoQuery] = useState("")
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>("custom")
  const [customDateFrom, setCustomDateFrom] = useState("")
  const [customDateTo, setCustomDateTo] = useState("")
  const [selectedFiscalYearStart, setSelectedFiscalYearStart] = useState("")
  const [importSessionFilter, setImportSessionFilter] = useState<ImportSessionFilter>("all")
  const [selectedArchivedSessionIds, setSelectedArchivedSessionIds] = useState<Set<string>>(new Set())
  const [sortState, setSortState] = useState<SortState>(defaultSort)
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSavingChanges, setIsSavingChanges] = useState(false)
  const [hiddenColumns, setHiddenColumns] = useState<Set<HiddenColumn>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [isReorderSheetOpen, setIsReorderSheetOpen] = useState(false)
  const [reorderDateDraft, setReorderDateDraft] = useState("")
  const [reorderAccountIdDraft, setReorderAccountIdDraft] = useState<string | null>(null)
  const [reorderMode, setReorderMode] = useState<ReorderMode | null>(null)
  const [draggedReorderTransactionId, setDraggedReorderTransactionId] = useState<string | null>(null)
  const [dropTargetTransactionId, setDropTargetTransactionId] = useState<string | null>(null)
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
  const accountTypeById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.accountType])),
    [accounts],
  )
  const filteredAccountTree = useMemo(
    () => filterAccountTree(accountTree, deferredAccountQuery.trim().toLowerCase()),
    [accountTree, deferredAccountQuery],
  )

  useEffect(() => {
    setCollapsedAccountIds(new Set(collectExpandableAccountIds(accountTree)))
  }, [accountTree])

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

  const transactionDateRange = useMemo(() => {
    if (draftTransactions.length === 0) {
      return { earliest: "", latest: "" }
    }

    const sortedDates = draftTransactions
      .map((transaction) => getTransactionDateKey(transaction.transactionDate))
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right))

    if (sortedDates.length === 0) {
      return { earliest: "", latest: "" }
    }

    return {
      earliest: sortedDates[0],
      latest: sortedDates[sortedDates.length - 1],
    }
  }, [draftTransactions])

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

  useEffect(() => {
    if (!transactionDateRange.earliest || !transactionDateRange.latest) {
      return
    }

    setCustomDateFrom((current) => current || transactionDateRange.earliest)
    setCustomDateTo((current) => current || transactionDateRange.latest)
  }, [transactionDateRange.earliest, transactionDateRange.latest])

  const fiscalYearOptions = useMemo(() => {
    if (!transactionDateRange.earliest || !transactionDateRange.latest) {
      return []
    }

    const earliestDate = parseDateKeyToLocalDate(transactionDateRange.earliest)
    const latestDate = parseDateKeyToLocalDate(transactionDateRange.latest)

    if (Number.isNaN(earliestDate.getTime()) || Number.isNaN(latestDate.getTime())) {
      return []
    }

    const startYear = getIndianFiscalYearStart(earliestDate)
    const endYear = getIndianFiscalYearStart(latestDate)
    const options: Array<{ value: string; fyLabel: string; ayLabel: string }> = []

    for (let year = endYear; year >= startYear; year -= 1) {
      options.push({
        value: String(year),
        fyLabel: formatFiscalYearLabel(year),
        ayLabel: formatAssessmentYearLabel(year),
      })
    }

    return options
  }, [transactionDateRange.earliest, transactionDateRange.latest])

  useEffect(() => {
    if (selectedFiscalYearStart || fiscalYearOptions.length === 0) {
      return
    }

    setSelectedFiscalYearStart(fiscalYearOptions[0].value)
  }, [fiscalYearOptions, selectedFiscalYearStart])

  const effectiveDateRange = useMemo(() => {
    if (dateRangeMode === "custom") {
      return {
        from: customDateFrom,
        to: customDateTo,
      }
    }

    if (!selectedFiscalYearStart) {
      return {
        from: "",
        to: "",
      }
    }

    const startYear = Number(selectedFiscalYearStart)
    return {
      from: `${startYear}-04-01`,
      to: `${startYear + 1}-03-31`,
    }
  }, [customDateFrom, customDateTo, dateRangeMode, selectedFiscalYearStart])

  const filteredTransactions = useMemo(() => {
    const normalizedDescription = deferredDescriptionQuery.trim().toLowerCase()
    const normalizedMemo = deferredMemoQuery.trim().toLowerCase()

    return draftTransactions.filter((transaction) => {
      if (!isTransactionDateInRange(transaction.transactionDate, effectiveDateRange)) {
        return false
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
    deferredDescriptionQuery,
    deferredMemoQuery,
    draftTransactions,
    effectiveDateRange.from,
    effectiveDateRange.to,
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

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize))
  const pagedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedTransactions.slice(startIndex, startIndex + pageSize)
  }, [currentPage, pageSize, sortedTransactions])
  const reorderTransactions = useMemo(() => {
    if (!reorderMode) {
      return []
    }

    return [...draftTransactions]
      .filter(
        (transaction) =>
          getTransactionDateKey(transaction.transactionDate) === reorderMode.date &&
          transaction.splits.some((split) => split.accountId === reorderMode.accountId),
      )
      .sort(compareTransactionsInChronologicalOrder)
  }, [draftTransactions, reorderMode])
  const displayedTransactions = reorderMode ? reorderTransactions : pagedTransactions

  const visibleTransactionIds = useMemo(
    () => displayedTransactions.map((transaction) => transaction.id),
    [displayedTransactions],
  )
  const visibleSelectionCount = visibleTransactionIds.filter((id) => selectedTransactionIds.has(id)).length
  const areAllVisibleSelected =
    visibleTransactionIds.length > 0 && visibleSelectionCount === visibleTransactionIds.length

  useEffect(() => {
    setCurrentPage(1)
  }, [
    customDateFrom,
    customDateTo,
    dateRangeMode,
    deferredDescriptionQuery,
    deferredMemoQuery,
    importSessionFilter,
    selectedFiscalYearStart,
    selectedAccountIds,
    selectedArchivedSessionIds,
    sortState,
    pageSize,
  ])

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  useEffect(() => {
    if (!reorderMode) {
      return
    }

    const hasMatchingAccount = accounts.some((account) => account.id === reorderMode.accountId)
    if (!hasMatchingAccount) {
      setReorderMode(null)
    }
  }, [accounts, reorderMode])

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
          ledgerSequence: transaction.ledgerSequence,
          description: transaction.description,
          referenceNumber: transaction.referenceNumber,
          splits: transaction.splits.map((split) => ({
            id: split.id,
            accountId: split.accountId,
            amount: split.amount,
            side: split.side,
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
  const reorderAccount = reorderMode
    ? accounts.find((account) => account.id === reorderMode.accountId) ?? null
    : null
  const reorderAccountLabel = reorderAccount
    ? accountPathLookup.get(reorderAccount.id) ?? reorderAccount.name
    : "Unknown account"
  const reorderDateLabel = reorderMode?.date
    ? parseDateKeyToLocalDate(reorderMode.date).toLocaleDateString()
    : ""
  const reorderBalanceByTransactionId = useMemo(() => {
    if (!reorderMode || !reorderAccount) {
      return new Map<string, { delta: number; trailingBalance: number }>()
    }

    const startingBalance =
      reorderAccount.openingBalance +
      draftTransactions
        .filter(
          (transaction) =>
            getTransactionDateKey(transaction.transactionDate) < reorderMode.date &&
            transaction.splits.some((split) => split.accountId === reorderMode.accountId),
        )
        .sort(compareTransactionsInChronologicalOrder)
        .reduce(
          (balance, transaction) =>
            balance + getTransactionBalanceDelta(transaction, reorderMode.accountId, accountTypeById),
          0,
        )

    let runningBalance = startingBalance
    const entries = new Map<string, { delta: number; trailingBalance: number }>()

    reorderTransactions.forEach((transaction) => {
      const delta = getTransactionBalanceDelta(transaction, reorderMode.accountId, accountTypeById)
      runningBalance += delta
      entries.set(transaction.id, { delta, trailingBalance: runningBalance })
    })

    return entries
  }, [accountTypeById, draftTransactions, reorderAccount, reorderMode, reorderTransactions])
  const canStartReorderMode = Boolean(reorderDateDraft && reorderAccountIdDraft)
  const reorderDateTransactionCount = useMemo(() => {
    if (!reorderDateDraft || !reorderAccountIdDraft) {
      return 0
    }

    return draftTransactions.filter(
      (transaction) =>
        getTransactionDateKey(transaction.transactionDate) === reorderDateDraft &&
        transaction.splits.some((split) => split.accountId === reorderAccountIdDraft),
    ).length
  }, [draftTransactions, reorderAccountIdDraft, reorderDateDraft])
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

  function openReorderSheet() {
    setReorderDateDraft(
      reorderMode?.date ||
        customDateFrom ||
        transactionDateRange.latest ||
        transactionDateRange.earliest,
    )
    setReorderAccountIdDraft(
      reorderMode?.accountId ||
        (selectedAccountIds.size === 1 ? Array.from(selectedAccountIds)[0] : null),
    )
    setIsReorderSheetOpen(true)
  }

  function applyReorderMode() {
    if (!reorderDateDraft || !reorderAccountIdDraft) {
      return
    }

    setReorderMode({
      date: reorderDateDraft,
      accountId: reorderAccountIdDraft,
    })
    setIsReorderSheetOpen(false)
  }

  function applyReorderTransactionIds(reorderedTargetIds: string[]) {
    if (!reorderMode) {
      return
    }

    commitDraft((current) => applyReorderedDayTransactions(current, reorderMode.date, reorderedTargetIds))
  }

  function handleReorderDragStart(transactionId: string) {
    setDraggedReorderTransactionId(transactionId)
    setDropTargetTransactionId(transactionId)
  }

  function handleReorderDrop(targetTransactionId: string) {
    if (!draggedReorderTransactionId || draggedReorderTransactionId === targetTransactionId) {
      setDraggedReorderTransactionId(null)
      setDropTargetTransactionId(null)
      return
    }

    const reorderedTargetIds = reorderTransactions.map((transaction) => transaction.id)
    const draggedIndex = reorderedTargetIds.indexOf(draggedReorderTransactionId)
    const targetIndex = reorderedTargetIds.indexOf(targetTransactionId)

    if (draggedIndex < 0 || targetIndex < 0) {
      setDraggedReorderTransactionId(null)
      setDropTargetTransactionId(null)
      return
    }

    const [movedId] = reorderedTargetIds.splice(draggedIndex, 1)
    const nextTargetIndex = reorderedTargetIds.indexOf(targetTransactionId)
    reorderedTargetIds.splice(nextTargetIndex, 0, movedId)

    applyReorderTransactionIds(reorderedTargetIds)
    setDraggedReorderTransactionId(null)
    setDropTargetTransactionId(null)
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
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    Compact tree multi-select
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCollapsedAccountIds(new Set(collectExpandableAccountIds(filteredAccountTree)))}
                    >
                      Collapse all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCollapsedAccountIds(new Set())}
                    >
                      Expand all
                    </Button>
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
                </div>
                <div className="mt-2 max-h-72 overflow-y-auto pr-1">
                  {filteredAccountTree.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground">No accounts match.</p>
                  ) : (
                    <AccountTreeMultiSelect
                      nodes={filteredAccountTree}
                      selectedAccountIds={selectedAccountIds}
                      collapsedAccountIds={collapsedAccountIds}
                      onToggleCollapse={(accountId) =>
                        setCollapsedAccountIds((current) => {
                          const next = new Set(current)
                          if (next.has(accountId)) {
                            next.delete(accountId)
                          } else {
                            next.add(accountId)
                          }
                          return next
                        })
                      }
                      onToggle={(node, checked) =>
                        setSelectedAccountIds((current) => {
                          const next = new Set(current)
                          const accountIds = collectAccountNodeIds(node)

                          if (checked) {
                            accountIds.forEach((accountId) => next.add(accountId))
                          } else {
                            accountIds.forEach((accountId) => next.delete(accountId))
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
            <span className="font-medium text-muted-foreground">Date mode</span>
            <Select value={dateRangeMode} onValueChange={(value) => setDateRangeMode(value as DateRangeMode)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="fy">Financial Year</SelectItem>
                <SelectItem value="ay">Assessment Year</SelectItem>
              </SelectContent>
            </Select>
          </label>

          {dateRangeMode === "custom" ? (
            <>
              <label className="min-w-[10rem] space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">From</span>
                <Input
                  type="date"
                  value={customDateFrom}
                  onChange={(event) => setCustomDateFrom(event.target.value)}
                  min={transactionDateRange.earliest || undefined}
                  max={transactionDateRange.latest || undefined}
                  className="h-8"
                />
              </label>

              <label className="min-w-[10rem] space-y-1 text-xs">
                <span className="font-medium text-muted-foreground">To</span>
                <Input
                  type="date"
                  value={customDateTo}
                  onChange={(event) => setCustomDateTo(event.target.value)}
                  min={transactionDateRange.earliest || undefined}
                  max={transactionDateRange.latest || undefined}
                  className="h-8"
                />
              </label>
            </>
          ) : (
            <label className="min-w-[12rem] space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">
                {dateRangeMode === "fy" ? "Financial Year" : "Assessment Year"}
              </span>
              <Select value={selectedFiscalYearStart} onValueChange={setSelectedFiscalYearStart}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {fiscalYearOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {dateRangeMode === "fy" ? option.fyLabel : option.ayLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}

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
              onClick={openReorderSheet}
            >
              <ArrowDownUp />
              Reorder Same Transactions
            </Button>
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
                setDateRangeMode("custom")
                setCustomDateFrom(transactionDateRange.earliest)
                setCustomDateTo(transactionDateRange.latest)
                setSelectedFiscalYearStart(fiscalYearOptions[0]?.value ?? "")
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

        {reorderMode ? (
          <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Reorder mode is active</p>
                <p className="text-xs text-muted-foreground">
                  Editing {reorderTransactions.length} transaction{reorderTransactions.length === 1 ? "" : "s"} on{" "}
                  {reorderDateLabel} for {reorderAccountLabel}. Move rows up or down to change same-day order.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setReorderMode(null)}
              >
                Exit reorder mode
              </Button>
            </div>
          </div>
        ) : null}

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
          <>
            <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                {reorderMode ? (
                  <>
                    Reordering{" "}
                    <span className="font-medium text-foreground">{reorderTransactions.length}</span> same-day
                    transaction{reorderTransactions.length === 1 ? "" : "s"}
                  </>
                ) : (
                  <>
                    Showing{" "}
                    <span className="font-medium text-foreground">
                      {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, sortedTransactions.length)}
                    </span>{" "}
                    of <span className="font-medium text-foreground">{sortedTransactions.length}</span> transactions
                  </>
                )}
              </p>
              {!reorderMode ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => setPageSize(Number(value))}
                  >
                    <SelectTrigger className="h-8 w-[8.5rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25 / page</SelectItem>
                      <SelectItem value="50">50 / page</SelectItem>
                      <SelectItem value="100">100 / page</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground">
                    Page <span className="font-medium text-foreground">{currentPage}</span> / {totalPages}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
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
                  {reorderMode ? (
                    <>
                      <th className="w-28 px-2 py-2 text-left font-medium">Reorder</th>
                      <th className="w-28 px-2 py-2 text-right font-medium">Trailing balance</th>
                    </>
                  ) : null}
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
                  <th className="w-28 px-2 py-2 text-left font-medium">Balance Change</th>
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
                {displayedTransactions.map((transaction) => {
                  const isSelected = selectedTransactionIds.has(transaction.id)
                  const splitTotal = getDebitTotal(transaction)
                  const savedSnapshot = savedTransactions.find((item) => item.id === transaction.id)
                  const isModified =
                    !savedSnapshot || serializeTransaction(savedSnapshot) !== serializeTransaction(transaction)
                  const reorderBalance = reorderBalanceByTransactionId.get(transaction.id)
                  const isDropTarget = dropTargetTransactionId === transaction.id

                  return (
                    <Fragment key={transaction.id}>
                      {orderSplitsForDisplay(transaction.splits).map((split, splitIndex) => {
                        const splitAccountLabel = accountPathLookup.get(split.accountId) ?? split.accountId
                        const splitEffect = getAccountEffectForSplitSide(
                          accountTypeById.get(split.accountId),
                          split.side,
                        )
                        const isIncrease = splitEffect === "increase"

                        return (
                          <tr
                            key={`${transaction.id}-${split.id}`}
                            className={cn(
                              "border-t align-top",
                              isModified
                                ? "bg-amber-50/80 dark:bg-amber-500/10"
                                : "bg-background",
                              isSelected && "ring-1 ring-primary/20",
                              reorderMode && splitIndex === 0 && "cursor-move",
                              reorderMode && isDropTarget && "ring-2 ring-primary/30",
                            )}
                            draggable={Boolean(reorderMode && splitIndex === 0)}
                            onDragStart={
                              reorderMode && splitIndex === 0
                                ? () => handleReorderDragStart(transaction.id)
                                : undefined
                            }
                            onDragOver={
                              reorderMode && splitIndex === 0
                                ? (event) => {
                                    event.preventDefault()
                                    if (dropTargetTransactionId !== transaction.id) {
                                      setDropTargetTransactionId(transaction.id)
                                    }
                                  }
                                : undefined
                            }
                            onDrop={
                              reorderMode && splitIndex === 0
                                ? (event) => {
                                    event.preventDefault()
                                    handleReorderDrop(transaction.id)
                                  }
                                : undefined
                            }
                            onDragEnd={
                              reorderMode && splitIndex === 0
                                ? () => {
                                    setDraggedReorderTransactionId(null)
                                    setDropTargetTransactionId(null)
                                  }
                                : undefined
                            }
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
                                {reorderMode ? (
                                  <>
                                    <td className="px-2 py-2" rowSpan={transaction.splits.length}>
                                      <div className="rounded-md border bg-background px-2 py-1.5 text-[11px] text-muted-foreground">
                                        Drag row
                                      </div>
                                    </td>
                                    <td
                                      className="px-2 py-2 text-right font-medium tabular-nums"
                                      rowSpan={transaction.splits.length}
                                    >
                                      <div>{formatNumber(reorderBalance?.trailingBalance ?? 0)}</div>
                                      <div
                                        className={cn(
                                          "text-[11px]",
                                          (reorderBalance?.delta ?? 0) >= 0
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : "text-rose-600 dark:text-rose-400",
                                        )}
                                      >
                                        {formatSignedAmount(reorderBalance?.delta ?? 0, formatNumber)}
                                      </div>
                                    </td>
                                  </>
                                ) : null}
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
                                "px-2 py-2 font-medium",
                                isIncrease ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                              )}
                            >
                              {isIncrease ? "Increase" : "Decrease"}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {split.side === "debit" ? (
                                <span className="text-rose-600 dark:text-rose-400">
                                  {formatNumber(Math.abs(split.amount))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {split.side === "credit" ? (
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
          </>
        )}
      </section>
      <Sheet open={isReorderSheetOpen} onOpenChange={setIsReorderSheetOpen}>
        <SheetContent side="right" className="flex w-full max-w-xl flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b bg-card px-6 py-5">
            <SheetTitle>Reorder Same Transactions</SheetTitle>
            <SheetDescription>
              Pick one date and one account. The table will switch into same-day reorder mode and show trailing balances for that account.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 px-6 py-5">
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-muted-foreground">Transaction date</span>
              <Input
                type="date"
                value={reorderDateDraft}
                onChange={(event) => setReorderDateDraft(event.target.value)}
                min={transactionDateRange.earliest || undefined}
                max={transactionDateRange.latest || undefined}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-muted-foreground">Account</span>
              <AccountSearchSelect
                accounts={accounts}
                value={reorderAccountIdDraft}
                onValueChange={setReorderAccountIdDraft}
                allowEmpty
                usePortal={false}
                emptyLabel="Choose account"
                placeholder="Choose account"
                getAccountLabel={(account) => accountPathLookup.get(account.id) ?? account.name}
              />
            </label>
            <div className="rounded-xl border bg-background/70 p-3 text-sm text-muted-foreground">
              {canStartReorderMode ? (
                <>
                  Matching transactions for this date/account:{" "}
                  <span className="font-medium text-foreground">{reorderDateTransactionCount}</span>
                </>
              ) : (
                "Choose both a date and an account to enter reorder mode."
              )}
            </div>
          </div>
          <SheetFooter className="border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsReorderSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={applyReorderMode}
              disabled={!canStartReorderMode}
            >
              Start reorder mode
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
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
  collapsedAccountIds,
  onToggleCollapse,
  onToggle,
  depth = 0,
}: {
  nodes: AccountNode[]
  selectedAccountIds: Set<string>
  collapsedAccountIds: Set<string>
  onToggleCollapse: (accountId: string) => void
  onToggle: (node: AccountNode, checked: boolean) => void
  depth?: number
}) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => {
        const isChecked = selectedAccountIds.has(node.id)
        const isCollapsed = collapsedAccountIds.has(node.id)
        const hasChildren = node.children.length > 0

        return (
          <div key={node.id}>
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/60",
                isChecked && "bg-primary/5",
              )}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggleCollapse(node.id)}
                  aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
                  className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronDown className={cn("size-3 transition", isCollapsed && "-rotate-90")} />
                </button>
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <label className="flex min-w-0 items-start gap-2">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => onToggle(node, Boolean(checked))}
                  aria-label={`Select account ${node.name}`}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{node.name}</span>
                </span>
              </label>
            </div>
            {hasChildren && !isCollapsed ? (
              <AccountTreeMultiSelect
                nodes={node.children}
                selectedAccountIds={selectedAccountIds}
                collapsedAccountIds={collapsedAccountIds}
                onToggleCollapse={onToggleCollapse}
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

function collectAccountNodeIds(node: AccountNode): string[] {
  return [node.id, ...node.children.flatMap((child) => collectAccountNodeIds(child))]
}

function collectExpandableAccountIds(nodes: AccountNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children.length > 0 ? [node.id, ...collectExpandableAccountIds(node.children)] : [],
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
      return withChronologicalTieBreak(
        (getComparableDateValue(left.transactionDate) - getComparableDateValue(right.transactionDate)) *
          direction,
        left,
        right,
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

function compareTransactionsInChronologicalOrder(left: Transaction, right: Transaction) {
  const dateComparison =
    getComparableDateValue(left.transactionDate) - getComparableDateValue(right.transactionDate)

  if (dateComparison !== 0) {
    return dateComparison
  }

  if (left.ledgerSequence !== right.ledgerSequence) {
    return left.ledgerSequence - right.ledgerSequence
  }

  return left.createdAt.localeCompare(right.createdAt)
}

function withChronologicalTieBreak(comparison: number, left: Transaction, right: Transaction) {
  if (comparison !== 0) {
    return comparison
  }

  return compareTransactionsInChronologicalOrder(left, right)
}

function compareStrings(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true })
}

function getComparableDateValue(value: string) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getDebitTotal(transaction: Transaction) {
  return getSplitDebitTotal(transaction.splits)
}

function getCreditTotal(transaction: Transaction) {
  return getSplitCreditTotal(transaction.splits)
}

function orderSplitsForDisplay(transactionSplits: Transaction["splits"]) {
  return [...transactionSplits].sort((left, right) => getSignedSplitAmount(left) - getSignedSplitAmount(right))
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function getIndianFiscalYearStart(date: Date) {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
}

function formatFiscalYearLabel(startYear: number) {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`
}

function formatAssessmentYearLabel(startYear: number) {
  const assessmentStart = startYear + 1
  return `AY ${assessmentStart}-${String((assessmentStart + 1) % 100).padStart(2, "0")}`
}

function cloneTransactions(transactions: Transaction[]) {
  return transactions.map((transaction) => ({
    ...transaction,
    splits: transaction.splits.map((split) => ({ ...split })),
  }))
}

function applyReorderedDayTransactions(
  transactions: Transaction[],
  dateKey: string,
  reorderedTargetIds: string[],
) {
  const transactionsOnDate = [...transactions]
    .filter((transaction) => getTransactionDateKey(transaction.transactionDate) === dateKey)
    .sort(compareTransactionsInChronologicalOrder)

  if (transactionsOnDate.length === 0) {
    return transactions
  }

  const reorderedTargetIdSet = new Set(reorderedTargetIds)
  const replacementQueue = [...reorderedTargetIds]
  const nextDayOrder = transactionsOnDate.map((transaction) => {
    if (!reorderedTargetIdSet.has(transaction.id)) {
      return transaction.id
    }

    const nextId = replacementQueue.shift()
    return nextId ?? transaction.id
  })
  const ledgerSequenceByTransactionId = new Map(nextDayOrder.map((id, index) => [id, index + 1]))

  return transactions.map((transaction) => {
    if (getTransactionDateKey(transaction.transactionDate) !== dateKey) {
      return transaction
    }

    const nextLedgerSequence = ledgerSequenceByTransactionId.get(transaction.id)
    if (nextLedgerSequence == null || nextLedgerSequence === transaction.ledgerSequence) {
      return transaction
    }

    return {
      ...transaction,
      ledgerSequence: nextLedgerSequence,
    }
  })
}

function getTransactionBalanceDelta(
  transaction: Transaction,
  accountId: string,
  accountTypeById: Map<string, Account["accountType"]>,
) {
  return transaction.splits
    .filter((split) => split.accountId === accountId)
    .reduce((sum, split) => {
      const effect = getAccountEffectForSplitSide(accountTypeById.get(split.accountId), split.side)
      return sum + (effect === "increase" ? split.amount : -split.amount)
    }, 0)
}

function formatSignedAmount(value: number, formatNumber: (value: number) => string) {
  if (value === 0) {
    return formatNumber(0)
  }

  return `${value > 0 ? "+" : "-"}${formatNumber(Math.abs(value))}`
}

function serializeTransaction(transaction: Transaction) {
  return JSON.stringify(transaction)
}

function serializeTransactions(transactions: Transaction[]) {
  return JSON.stringify(transactions)
}
