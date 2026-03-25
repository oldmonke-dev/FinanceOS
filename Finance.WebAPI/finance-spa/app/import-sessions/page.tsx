"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Briefcase,
  CalendarClock,
  CircleDashed,
  RefreshCw,
  SearchX,
  FileSpreadsheet,
  FolderInput,
  Landmark,
  Sparkles,
} from "lucide-react"

import { AccountSearchSelect } from "@/components/account-search-select"
import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider"
import { useSnackbar } from "@/components/providers/snackbar-provider"
import { useImportSessions } from "@/components/providers/import-sessions-provider"
import { useRegisterUnsavedChanges } from "@/components/providers/unsaved-changes-provider"
import { useUserPreferences } from "@/components/providers/user-preferences-provider"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatAccountType } from "@/lib/accounts"
import { getTransactions } from "@/lib/transactions"
import { type ImportSession, type ImportSessionRow } from "@/models/import-session"
import { type Transaction } from "@/models/transaction"

type ResolvedSessionRow = {
  sessionId: string
  sessionTitle: string
  rowId: string
  rowIndex: number
  dateKey: string | null
  description: string
  reference: string
  amount: number | null
  sourceAccountId: string | null
  destinationAccountId: string | null
}

type ResolvedLedgerTransaction = {
  transactionId: string
  dateKey: string | null
  description: string
  reference: string
  amount: number | null
  sourceAccountId: string | null
  destinationAccountId: string | null
}

type StrategyMode =
  | "unassigned"
  | "bayesian_statistics"
  | "nearest_neighbor"
  | "text_similarity"
  | "frequency_pattern"
  | "hybrid_ensemble"

export default function ImportSessionsPage() {
  const { accounts } = useAccounts()
  const { confirm } = useConfirmationDialog()
  const { showSnackbar } = useSnackbar()
  const { formatNumber } = useUserPreferences()
  const {
    sessions,
    isLoading,
    errorMessage,
    deleteSession,
    saveSession,
    hasUnsavedChanges,
    updateTitle,
    updateSourceAccount,
    updateRowDestinationAccount,
    addSessionToLedger,
    reapplyLearning,
    revertLearning,
    deleteRows,
  } = useImportSessions()
  const [isSavingSession, setIsSavingSession] = useState(false)
  const [isDeletingSession, setIsDeletingSession] = useState(false)
  const [isAddingToLedger, setIsAddingToLedger] = useState(false)
  const [isDeletingRows, setIsDeletingRows] = useState(false)
  const [isReapplyingLearning, setIsReapplyingLearning] = useState(false)
  const [isRevertingLearning, setIsRevertingLearning] = useState(false)
  const [isLoadingSimilarity, setIsLoadingSimilarity] = useState(false)
  const [similarityLoadedSessionId, setSimilarityLoadedSessionId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showAllRows, setShowAllRows] = useState(false)
  const [rowsPerPage, setRowsPerPage] = useState<10 | 50 | 100>(10)
  const [sortMode, setSortMode] = useState<"original" | "description_uniqueness">("original")
  const [strategyMode, setStrategyMode] = useState<StrategyMode>("unassigned")
  const [strategyCheckMessage, setStrategyCheckMessage] = useState<string | null>(null)
  const [strategyCheckTone, setStrategyCheckTone] = useState<"warning" | "success">("warning")
  const [sessionView, setSessionView] = useState<"active" | "archived">("active")
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [ledgerTransactions, setLedgerTransactions] = useState<Transaction[]>([])
  const [draftTitle, setDraftTitle] = useState("")

  const filteredSessions = useMemo(
    () => sessions.filter((session) => (sessionView === "active" ? !session.isArchived : session.isArchived)),
    [sessionView, sessions],
  )

  useEffect(() => {
    if (!filteredSessions.length) {
      setActiveSessionId(null)
      return
    }

    setActiveSessionId((current) =>
      current && filteredSessions.some((session) => session.id === current)
        ? current
        : filteredSessions[0].id,
    )
  }, [filteredSessions])

  useEffect(() => {
    const nextActiveSession =
      filteredSessions.find((session) => session.id === activeSessionId) ?? filteredSessions[0] ?? null

    setCurrentPage(1)
    setShowAllRows(false)
    setSortMode("original")
    setStrategyMode(resolveStrategyMode(nextActiveSession))
    setStrategyCheckMessage(null)
    setSelectedRowIds(new Set())
  }, [activeSessionId, filteredSessions])

  useEffect(() => {
    setCurrentPage(1)
  }, [rowsPerPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [sortMode])

  const activeSession =
    filteredSessions.find((session) => session.id === activeSessionId) ?? filteredSessions[0] ?? null
  const isReadOnlySession = activeSession?.isArchived ?? false
  const activeSessionHasUnsavedChanges = activeSession ? hasUnsavedChanges(activeSession.id) : false
  const isSimilarityLoadedForActiveSession =
    activeSession != null && similarityLoadedSessionId === activeSession.id

  useEffect(() => {
    setDraftTitle(activeSession?.fileName ?? "")
  }, [activeSession?.id, activeSession?.fileName])

  useEffect(() => {
    setSimilarityLoadedSessionId(null)
    setLedgerTransactions([])
    setIsLoadingSimilarity(false)
  }, [activeSession?.id])

  useEffect(() => {
    if (!activeSession || isReadOnlySession) {
      return
    }

    const normalizedDraftTitle = draftTitle.trim() ? draftTitle : null
    const normalizedSessionTitle = activeSession.fileName ?? null

    if (normalizedDraftTitle === normalizedSessionTitle) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void updateTitle(activeSession.id, normalizedDraftTitle)
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [activeSession, draftTitle, isReadOnlySession, updateTitle])

  const activeRows = useMemo(
    () =>
      !activeSession
        ? []
        : isReadOnlySession
          ? activeSession.rows
          : activeSession.rows.filter((row) => row.addedToLedgerAt == null),
    [activeSession, isReadOnlySession],
  )
  const mappedRowCount = activeRows.filter((row) => row.destinationAccountId != null).length
  const postedRowCount = activeSession
    ? activeSession.rows.filter((row) => row.addedToLedgerAt != null).length
    : 0
  const hasPostableRows =
    activeSession?.sourceAccountId != null &&
    activeRows.some((row) => row.destinationAccountId != null)
  const descriptionColumnIndex = useMemo(() => {
    if (!activeSession) {
      return -1
    }

    const match = Object.entries(activeSession.columnMappings).find(
      ([, value]) => value === "description",
    )

    return match ? Number(match[0]) : -1
  }, [activeSession])
  const sortedRows = useMemo(() => {
    if (!activeSession) {
      return []
    }

    if (sortMode === "original" || descriptionColumnIndex < 0) {
      return activeRows
    }

    const counts = new Map<string, number>()

    for (const row of activeRows) {
      const description = normalizeDescriptionValue(row.values[descriptionColumnIndex] ?? "")
      counts.set(description, (counts.get(description) ?? 0) + 1)
    }

    return [...activeRows].sort((left, right) => {
      const leftDescription = normalizeDescriptionValue(left.values[descriptionColumnIndex] ?? "")
      const rightDescription = normalizeDescriptionValue(right.values[descriptionColumnIndex] ?? "")
      const leftCount = counts.get(leftDescription) ?? 0
      const rightCount = counts.get(rightDescription) ?? 0

      if (leftCount !== rightCount) {
        return leftCount - rightCount
      }

      return left.rowIndex - right.rowIndex
    })
  }, [activeRows, activeSession, descriptionColumnIndex, sortMode])
  const visibleRows = sortedRows
  const totalPages = activeSession
    ? Math.max(1, Math.ceil(visibleRows.length / rowsPerPage))
    : 1
  const pagedRows = activeSession
    ? showAllRows
      ? visibleRows
      : visibleRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
    : []
  const mappedColumnIndexes = useMemo(() => {
    if (!activeSession) {
      return []
    }

    return Object.entries(activeSession.columnMappings)
      .filter(([, value]) => value && value !== "unmapped")
      .map(([key]) => Number(key))
      .sort((left, right) => left - right)
  }, [activeSession])

  const availableDestinationAccounts = useMemo(
    () => accounts.filter((account) => String(account.id) !== activeSession?.sourceAccountId),
    [accounts, activeSession?.sourceAccountId],
  )
  const sourceAccountOptions = useMemo(() => accounts, [accounts])
  const allVisibleRowsSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedRowIds.has(row.id))
  const resolvedActiveRows = useMemo(() => {
    if (!isSimilarityLoadedForActiveSession) {
      return []
    }

    return sessions
      .filter((session) => !session.isArchived)
      .flatMap((session) =>
        session.rows
          .map((row) => resolveSessionRow(session, row))
          .filter((item): item is ResolvedSessionRow => item !== null),
      )
  }, [isSimilarityLoadedForActiveSession, sessions])
  const resolvedCurrentRowById = useMemo(() => {
    if (!isSimilarityLoadedForActiveSession) {
      return new Map<string, ResolvedSessionRow | null>()
    }

    return new Map(
      activeRows.map((row) => [
        row.id,
        activeSession ? resolveSessionRow(activeSession, row) : null,
      ] as const),
    )
  }, [activeRows, activeSession, isSimilarityLoadedForActiveSession])
  const activeSessionSimilarityByRowId = useMemo(() => {
    if (!activeSession || !isSimilarityLoadedForActiveSession) {
      return new Map<string, number>()
    }

    return new Map(
      activeRows.map((row) => {
        const resolvedRow = resolvedCurrentRowById.get(row.id) ?? null
        if (!resolvedRow) {
          return [row.id, 0] as const
        }

        const bestScore = resolvedActiveRows
          .filter(
            (candidate) =>
              candidate.sessionId !== activeSession.id && candidate.rowId !== row.id,
          )
          .reduce((currentBest, candidate) => {
            const score = scoreResolvedRows(resolvedRow, candidate)
            return Math.max(currentBest, score)
          }, 0)

        return [row.id, bestScore] as const
      }),
    )
  }, [activeRows, activeSession, isSimilarityLoadedForActiveSession, resolvedActiveRows, resolvedCurrentRowById])
  const bestActiveSessionMatchByRowId = useMemo(() => {
    if (!activeSession || !isSimilarityLoadedForActiveSession) {
      return new Map<string, ResolvedSessionRow | null>()
    }

    return new Map(
      activeRows.map((row) => {
        const resolvedRow = resolvedCurrentRowById.get(row.id) ?? null
        if (!resolvedRow) {
          return [row.id, null] as const
        }

        let bestMatch: ResolvedSessionRow | null = null
        let bestScore = -1

        for (const candidate of resolvedActiveRows) {
          if (candidate.sessionId === activeSession.id || candidate.rowId === row.id) {
            continue
          }

          const score = scoreResolvedRows(resolvedRow, candidate)
          if (score > bestScore) {
            bestScore = score
            bestMatch = candidate
          }
        }

        return [row.id, bestMatch] as const
      }),
    )
  }, [activeRows, activeSession, isSimilarityLoadedForActiveSession, resolvedActiveRows, resolvedCurrentRowById])
  const resolvedLedgerTransactions = useMemo(
    () =>
      isSimilarityLoadedForActiveSession
        ? ledgerTransactions
            .map(resolveLedgerTransaction)
            .filter((item): item is ResolvedLedgerTransaction => item !== null)
        : [],
    [isSimilarityLoadedForActiveSession, ledgerTransactions],
  )
  const ledgerSimilarityByRowId = useMemo(() => {
    if (!activeSession || !isSimilarityLoadedForActiveSession) {
      return new Map<string, number>()
    }

    return new Map(
      activeRows.map((row) => {
        const resolvedRow = resolvedCurrentRowById.get(row.id) ?? null
        if (!resolvedRow) {
          return [row.id, 0] as const
        }

        const bestScore = resolvedLedgerTransactions.reduce((currentBest, candidate) => {
          const score = scoreLedgerMatch(resolvedRow, candidate)
          return Math.max(currentBest, score)
        }, 0)

        return [row.id, bestScore] as const
      }),
    )
  }, [activeRows, activeSession, isSimilarityLoadedForActiveSession, resolvedCurrentRowById, resolvedLedgerTransactions])
  const bestLedgerMatchByRowId = useMemo(() => {
    if (!activeSession || !isSimilarityLoadedForActiveSession) {
      return new Map<string, ResolvedLedgerTransaction | null>()
    }

    return new Map(
      activeRows.map((row) => {
        const resolvedRow = resolvedCurrentRowById.get(row.id) ?? null
        if (!resolvedRow) {
          return [row.id, null] as const
        }

        let bestMatch: ResolvedLedgerTransaction | null = null
        let bestScore = -1

        for (const candidate of resolvedLedgerTransactions) {
          const score = scoreLedgerMatch(resolvedRow, candidate)
          if (score > bestScore) {
            bestScore = score
            bestMatch = candidate
          }
        }

        return [row.id, bestMatch] as const
      }),
    )
  }, [activeRows, activeSession, isSimilarityLoadedForActiveSession, resolvedCurrentRowById, resolvedLedgerTransactions])
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  )
  const accountPathLookup = useMemo(() => {
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
  }, [accountById, accounts])

  const saveActiveSessionChanges = useCallback(async () => {
    if (!activeSession) {
      return true
    }

    setIsSavingSession(true)

    try {
      await saveSession(activeSession.id)
      showSnackbar({ message: "Session saved.", tone: "success" })
      return true
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to save session.",
        tone: "error",
      })
      return false
    } finally {
      setIsSavingSession(false)
    }
  }, [activeSession, saveSession, showSnackbar])

  useRegisterUnsavedChanges(
    `import-session:${activeSession?.id ?? "none"}`,
    activeSessionHasUnsavedChanges,
    activeSession ? saveActiveSessionChanges : null,
  )

  async function handleSaveSession() {
    await saveActiveSessionChanges()
  }

  const sourceAccount = activeSession?.sourceAccountId
    ? accountById.get(activeSession.sourceAccountId) ?? null
    : null
  const sourceAccountLabel = sourceAccount
    ? formatAccountDisplayLabel(
        formatAccountType(sourceAccount.accountType),
        accountPathLookup.get(sourceAccount.id) ?? sourceAccount.name,
      )
    : "Unassigned"
  const canApplyLearning =
    !isReadOnlySession &&
    strategyMode !== "unassigned" &&
    isUserImportSession(activeSession?.label ?? null)
  const usesMockLearningAction = strategyMode !== "bayesian_statistics"

  async function handleDeleteSession() {
    if (!activeSession) {
      return
    }

    const confirmed = await confirm({
      title: "Delete session",
      message: `Delete "${getSessionTitle(activeSession.fileName)}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    })

    if (!confirmed) {
      return
    }

    setIsDeletingSession(true)

    try {
      await deleteSession(activeSession.id)
      showSnackbar({ message: "Session deleted.", tone: "success" })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to delete session.",
        tone: "error",
      })
    } finally {
      setIsDeletingSession(false)
    }
  }

  async function handleAddToLedger() {
    if (!activeSession) {
      return
    }

    setIsAddingToLedger(true)

    try {
      const result = await addSessionToLedger(activeSession.id)
      showSnackbar({
        message:
          `Created ${result.createdTransactionCount} transaction${result.createdTransactionCount === 1 ? "" : "s"} in the ledger.` +
          (result.skippedRowCount > 0
            ? ` ${result.skippedRowCount} row${result.skippedRowCount === 1 ? " was" : "s were"} skipped.`
            : ""),
        tone: "success",
        durationMs: 2600,
      })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to add rows to the ledger.",
        tone: "error",
      })
    } finally {
      setIsAddingToLedger(false)
    }
  }

  async function handleReapplyLearning() {
    if (!activeSession || !canApplyLearning) {
      return
    }

    if (usesMockLearningAction) {
      setStrategyCheckTone("warning")
      setStrategyCheckMessage(
        `${formatStrategyLabel(strategyMode)} is not wired yet. This button is a placeholder for now.`,
      )
      return
    }

    setIsReapplyingLearning(true)

    try {
      await saveSession(activeSession.id)
      await reapplyLearning(activeSession.id)
      showSnackbar({ message: "Learning applied to this session.", tone: "success" })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to apply learning.",
        tone: "error",
      })
    } finally {
      setIsReapplyingLearning(false)
    }
  }

  async function handleRevertLearning() {
    if (!activeSession) {
      return
    }

    setIsRevertingLearning(true)

    try {
      await saveSession(activeSession.id)
      await revertLearning(activeSession.id)
      showSnackbar({ message: "Session learning reverted.", tone: "success" })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to revert learning.",
        tone: "error",
      })
    } finally {
      setIsRevertingLearning(false)
    }
  }

  function handleStrategyModeChange(nextValue: string) {
    const nextMode = normalizeStrategyMode(nextValue)
    setStrategyMode(nextMode)

    if (
      nextMode !== "bayesian_statistics" ||
      !activeSession ||
      !isUserImportSession(activeSession.label)
    ) {
      setStrategyCheckMessage(null)
      return
    }

    const issues: string[] = []

    if (!activeSession.sourceAccountId) {
      issues.push("choose a source account")
    }

    if (activeRows.length === 0) {
      issues.push("load rows into the active review list")
    }

    if (!activeRows.some((row) => row.destinationAccountId == null)) {
      issues.push("keep at least one row unmapped so Bayesian has work to do")
    }

    if (issues.length > 0) {
      setStrategyCheckTone("warning")
      setStrategyCheckMessage(`Bayesian check: ${issues.join(", ")}.`)
      return
    }

    setStrategyCheckTone("success")
    setStrategyCheckMessage("Bayesian check passed. You can reapply learning for this session.")
  }

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((current) => {
      const next = new Set(current)

      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }

      return next
    })
  }

  function toggleAllVisibleRows() {
    setSelectedRowIds((current) => {
      const next = new Set(current)

      if (allVisibleRowsSelected) {
        visibleRows.forEach((row) => next.delete(row.id))
      } else {
        visibleRows.forEach((row) => next.add(row.id))
      }

      return next
    })
  }

  async function handleDeleteRows() {
    if (!activeSession || selectedRowIds.size === 0) {
      return
    }

    const confirmed = await confirm({
      title: "Delete rows",
      message: `Delete ${selectedRowIds.size} row${selectedRowIds.size === 1 ? "" : "s"} from this import session?`,
      confirmLabel: "Delete rows",
      variant: "destructive",
    })

    if (!confirmed) {
      return
    }

    setIsDeletingRows(true)

    try {
      await deleteRows(activeSession.id, Array.from(selectedRowIds))
      setSelectedRowIds(new Set())
      showSnackbar({
        message: `Deleted ${selectedRowIds.size} row${selectedRowIds.size === 1 ? "" : "s"}.`,
        tone: "success",
      })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to delete rows.",
        tone: "error",
      })
    } finally {
      setIsDeletingRows(false)
    }
  }

  async function handleLoadSimilarity() {
    if (!activeSession) {
      return
    }

    setIsLoadingSimilarity(true)

    try {
      const transactions = await getTransactions()
      setLedgerTransactions(transactions)
      setSimilarityLoadedSessionId(activeSession.id)
      showSnackbar({ message: "Similarity index loaded.", tone: "success" })
    } catch (error) {
      setLedgerTransactions([])
      setSimilarityLoadedSessionId(activeSession.id)
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to load similarity index.",
        tone: "error",
      })
    } finally {
      setIsLoadingSimilarity(false)
    }
  }

  return (
    <AppShell
      title="Import Sessions"
      subtitle="Navigate review sessions and map destination accounts before posting imports"
      badge={isLoading ? "Loading sessions" : `${sessions.length} sessions`}
    >
      {errorMessage ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {isLoading ? (
        <div className="rounded-3xl border bg-card p-10 text-center text-muted-foreground">
          Loading import sessions...
        </div>
      ) : null}
      {!isLoading && sessions.length === 0 ? (
        <div className="rounded-3xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          No import sessions yet. Create one from the importer page.
        </div>
      ) : !isLoading ? (
        <section className="space-y-4">
          <aside className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Sessions</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Each import creates a separate review session.
                </p>
              </div>
              <div className="inline-flex rounded-2xl border bg-background p-1 md:self-start">
                <button
                  type="button"
                  onClick={() => setSessionView("active")}
                  className={`rounded-xl px-3 py-1.5 text-sm ${sessionView === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setSessionView("archived")}
                  className={`rounded-xl px-3 py-1.5 text-sm ${sessionView === "archived" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  Archived
                </button>
              </div>
            </div>

            <div data-horizontal-scroll-region className="horizontal-scroll-region mt-5 flex gap-3 pb-1">
              {filteredSessions.map((session) => {
                const isActive = session.id === activeSession?.id
                const completedRows = session.rows.filter(
                  (row) =>
                    session.isArchived
                      ? row.addedToLedgerAt != null
                      : row.destinationAccountId != null && row.addedToLedgerAt == null,
                ).length

                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setActiveSessionId(session.id)}
                    className={`min-w-72 shrink-0 rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "bg-background/70 hover:bg-accent"
                    }`}
                  >
                    <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <FileSpreadsheet className="size-3.5" />
                      <span>{formatImportSessionLabel(session.label)}</span>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {getSessionCardTitle(session.fileName)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {new Date(session.createdAt).toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          By {session.createdByUserName}
                        </p>
                      </div>
                      <div className="rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground">
                        {session.isArchived
                          ? session.status
                          : session.rows.filter((row) => row.addedToLedgerAt == null).length}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                      <span>{session.isArchived ? "Completed rows" : "Destination mapped"}</span>
                      <span className="font-medium">
                        {completedRows}/{session.rows.length}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
            {filteredSessions.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed bg-background/70 p-6 text-sm text-muted-foreground">
                No {sessionView} import sessions.
              </div>
            ) : null}
          </aside>

          {activeSession ? (
            <article className="rounded-3xl border bg-card p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <Sparkles className="size-3.5" />
                    <span>Import Review Session</span>
                  </div>
                  {isReadOnlySession ? (
                    <h2 className="mt-2 text-xl font-semibold">
                      {getSessionTitle(activeSession.fileName)}
                    </h2>
                  ) : (
                    <div className="mt-2 max-w-xl">
                      <Input
                        className="h-10 border-none bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        placeholder="Untitled import session"
                      />
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1">
                      <CalendarClock className="size-4" />
                      <span>{new Date(activeSession.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1">
                      <span>By: {activeSession.createdByUserName}</span>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1">
                      <span>Label: {formatImportSessionLabel(activeSession.label)}</span>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1">
                      <span>Status: {activeSession.status}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground">
                  {mappedRowCount}/{activeRows.length} mapped
                </div>
              </div>

              <div className="mt-5 grid gap-2 md:grid-cols-3">
                <div className="rounded-xl border bg-background/70 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    {isReadOnlySession ? "Rows in archived session" : "Rows remaining"}
                  </p>
                  <p className="mt-1 text-lg font-semibold leading-none">{activeRows.length}</p>
                </div>
                <div className="rounded-xl border bg-background/70 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Destination mapped</p>
                  <p className="mt-1 text-lg font-semibold leading-none">{mappedRowCount}</p>
                </div>
                <div className="rounded-xl border bg-background/70 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    {isReadOnlySession ? "Posted to ledger" : "Unmapped"}
                  </p>
                  <p className="mt-1 text-lg font-semibold leading-none">
                    {isReadOnlySession ? postedRowCount : activeRows.length - mappedRowCount}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border bg-background/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Session actions</p>
                      <p className="text-xs text-muted-foreground">
                        Save mapping changes before posting rows into the ledger.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
                      <FolderInput className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">Source Account</span>
                      {isReadOnlySession ? (
                        <span className="max-w-80 truncate text-sm text-muted-foreground">
                          {sourceAccountLabel}
                        </span>
                      ) : (
                        <AccountSearchSelect
                          accounts={sourceAccountOptions}
                          value={activeSession.sourceAccountId}
                          onValueChange={(value) =>
                            void updateSourceAccount(activeSession.id, value)
                          }
                          emptyLabel="Unassigned"
                          allowEmpty
                          className="min-w-72 max-w-[28rem]"
                          triggerClassName="h-8 border-none bg-transparent px-2 shadow-none"
                          getAccountLabel={(account) =>
                            formatAccountDisplayLabel(
                              formatAccountType(account.accountType),
                              accountPathLookup.get(account.id) ?? account.name,
                            )
                          }
                        />
                      )}
                    </div>
                  </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleSaveSession()}
                      disabled={isReadOnlySession || !activeSessionHasUnsavedChanges || isSavingSession}
                    >
                      {isSavingSession ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleAddToLedger()}
                      disabled={isReadOnlySession || isAddingToLedger || !hasPostableRows}
                    >
                      {isAddingToLedger ? "Adding..." : "Add to Ledger"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleDeleteRows()}
                      disabled={isReadOnlySession || isDeletingRows || selectedRowIds.size === 0}
                    >
                      {isDeletingRows ? "Deleting..." : `Delete Rows (${selectedRowIds.size})`}
                    </Button>
                    {!isReadOnlySession ? (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => void handleDeleteSession()}
                        disabled={isDeletingSession || !activeSession.isDeletable}
                      >
                        {isDeletingSession
                          ? "Deleting..."
                          : activeSession.isDeletable
                            ? "Delete Session"
                            : "Protected"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {isReadOnlySession || activeSession.label === "account_deletion_sessions" ? (
                <div className="mt-4 rounded-2xl border bg-background/70 p-4 text-sm text-muted-foreground">
                  {isReadOnlySession
                    ? "Archived sessions are read-only. Rows stay visible for audit, but every field is locked."
                    : "This mandatory remediation session was created by deleting an account. Destination mappings are prefilled when a single surviving counterpart exists, and you must choose a replacement source account before reposting."}
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border bg-background/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Review mode</p>
                    <p className="text-xs text-muted-foreground">
                      Apply learning uses global learning plus manual mappings from this active session.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                    <Select
                      value={strategyMode}
                      onValueChange={handleStrategyModeChange}
                      disabled={isReadOnlySession}
                    >
                      <SelectTrigger className="w-full lg:w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        <SelectItem value="bayesian_statistics">Bayesian Statistics</SelectItem>
                        <SelectItem value="nearest_neighbor">Nearest Neighbor</SelectItem>
                        <SelectItem value="text_similarity">Text Similarity</SelectItem>
                        <SelectItem value="frequency_pattern">Frequency Pattern</SelectItem>
                        <SelectItem value="hybrid_ensemble">Hybrid Ensemble</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleReapplyLearning()}
                      disabled={!canApplyLearning || isReapplyingLearning}
                    >
                      {isReapplyingLearning ? "Applying..." : "Apply Learning"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleRevertLearning()}
                      disabled={isReadOnlySession || isRevertingLearning}
                    >
                      {isRevertingLearning ? "Reverting..." : "Revert Session Learning"}
                    </Button>
                  </div>
                </div>
                {strategyCheckMessage ? (
                  <div
                    className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                      strategyCheckTone === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                    }`}
                  >
                    {strategyCheckMessage}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border bg-background/70 p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Table view</p>
                    <p className="text-sm text-muted-foreground">
                      {showAllRows
                        ? `Showing all ${visibleRows.length} rows`
                        : `Showing ${visibleRows.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}-${Math.min(
                            currentPage * rowsPerPage,
                            visibleRows.length,
                          )} of ${visibleRows.length} rows`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={sortMode}
                      onValueChange={(value) =>
                        setSortMode(value as "original" | "description_uniqueness")
                      }
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="original">Original order</SelectItem>
                        <SelectItem value="description_uniqueness">
                          Unique descriptions first
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(rowsPerPage)}
                      onValueChange={(value) => setRowsPerPage(Number(value) as 10 | 50 | 100)}
                      disabled={showAllRows}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 rows</SelectItem>
                        <SelectItem value="50">50 rows</SelectItem>
                        <SelectItem value="100">100 rows</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAllRows((current) => !current)}
                    >
                      {showAllRows ? "Use pages" : "Show all"}
                    </Button>
                    <div className="inline-flex items-center gap-2 rounded-lg border bg-background p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={showAllRows || currentPage === 1}
                      >
                        Previous
                      </Button>
                      <div className="min-w-24 px-2 text-center text-sm text-muted-foreground">
                        {showAllRows ? "All rows" : `Page ${currentPage} / ${totalPages}`}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={showAllRows || currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-muted-foreground">
                Scroll horizontally to review all mapped columns and controls.
              </div>

              <div data-horizontal-scroll-region className="horizontal-scroll-region mt-5 rounded-2xl border pb-2">
                <table className="w-full min-w-[84rem] border-collapse text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      {!isReadOnlySession ? (
                        <th className="w-10 border-b px-2 py-3 text-center font-medium whitespace-nowrap">
                          <label className="inline-flex items-center justify-center">
                            <Checkbox
                              checked={allVisibleRowsSelected}
                              onCheckedChange={() => toggleAllVisibleRows()}
                              aria-label="Select all visible rows"
                            />
                          </label>
                        </th>
                      ) : null}
                      <th className="w-12 border-b px-2 py-3 text-left font-medium whitespace-nowrap">
                        Row
                      </th>
                      {mappedColumnIndexes.map((valueIndex) => (
                        <th
                          key={`header-${valueIndex}`}
                          className="border-b px-4 py-3 text-left font-medium whitespace-nowrap"
                        >
                          {getColumnLabel(activeSession.columnMappings, valueIndex)}
                        </th>
                      ))}
                      <th className="border-b px-4 py-3 text-left font-medium">
                        Destination account
                      </th>
                      <th className="border-b px-4 py-3 text-left font-medium whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2">
                          <span>Similarity Index</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-7"
                            onClick={() => void handleLoadSimilarity()}
                            disabled={!activeSession || isLoadingSimilarity}
                            aria-label="Load similarity index"
                          >
                            <RefreshCw className={`size-3.5 ${isLoadingSimilarity ? "animate-spin" : ""}`} />
                          </Button>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => {
                      const destinationAccount =
                        accounts.find((account) => account.id === row.destinationAccountId) ?? null
                      const presentation = getAccountTypePresentation(
                        destinationAccount?.accountType ?? null,
                      )
                      const activeSessionSimilarity =
                        activeSessionSimilarityByRowId.get(row.id) ?? 0
                      const ledgerSimilarity = ledgerSimilarityByRowId.get(row.id) ?? 0
                      const activeSessionMatch = bestActiveSessionMatchByRowId.get(row.id) ?? null
                      const ledgerMatch = bestLedgerMatchByRowId.get(row.id) ?? null
                      const resolvedCurrentRow = resolvedCurrentRowById.get(row.id) ?? null

                      return (
                        <tr
                          key={`${activeSession.id}-${row.rowIndex}`}
                          className={`${
                            isReadOnlySession
                              ? "bg-slate-200/80 text-slate-600"
                              : presentation.rowClass
                                ? `${presentation.rowClass} odd:bg-opacity-100 even:bg-opacity-100`
                                : "odd:bg-muted/10 even:bg-muted/35"
                          }`}
                        >
                          {!isReadOnlySession ? (
                            <td className="border-t px-2 py-2 text-center align-top">
                              <label className="inline-flex items-center justify-center">
                                <Checkbox
                                  checked={selectedRowIds.has(row.id)}
                                  onCheckedChange={() => toggleRowSelection(row.id)}
                                  aria-label={`Select row ${row.rowIndex + 1}`}
                                />
                              </label>
                            </td>
                          ) : null}
                          <td className="border-t px-2 py-2 align-top whitespace-nowrap">
                            {row.rowIndex + 1}
                          </td>
                          {mappedColumnIndexes.map((valueIndex) => (
                          <td
                            key={`${activeSession.id}-${row.rowIndex}-${valueIndex}`}
                            className={`border-t px-3 py-2 align-top ${
                              activeSession.columnMappings[valueIndex] === "date"
                                ? "min-w-[8.5rem] whitespace-nowrap"
                                : ""
                            }`}
                          >
                            <div
                              className={
                                activeSession.columnMappings[valueIndex] === "date"
                                  ? "whitespace-nowrap"
                                  : "max-w-56 break-words"
                              }
                            >
                              {row.values[valueIndex] || "-"}
                            </div>
                          </td>
                        ))}
                          <td className="border-t px-3 py-2 align-top">
                            <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                              <presentation.icon className={`size-3.5 ${presentation.iconClass}`} />
                              <span>{presentation.label}</span>
                            </div>
                            <AccountSearchSelect
                              accounts={availableDestinationAccounts}
                              value={row.destinationAccountId}
                              onValueChange={(value) =>
                                void updateRowDestinationAccount(
                                  activeSession.id,
                                  row.id,
                                  value,
                                )
                              }
                              disabled={isReadOnlySession}
                              placeholder="Unmapped destination"
                              getAccountLabel={(account) =>
                                accountPathLookup.get(account.id) ?? account.name
                              }
                            />
                            {row.destinationAccountError ? (
                              <p className="mt-2 text-xs text-destructive">
                                {row.destinationAccountError}
                              </p>
                            ) : null}
                            {row.mappingSource !== "none" ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Source: {formatMappingSource(row.mappingSource)}
                              </p>
                            ) : null}
                          </td>
                          <td className="border-t px-3 py-2 align-top">
                            <TooltipProvider>
                              {isSimilarityLoadedForActiveSession ? (
                                <div className="min-w-44 space-y-2 rounded-xl border bg-background/70 p-3">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="block w-full rounded-lg px-2 py-1 text-left transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      >
                                        <SimilarityBar
                                          label="Active sessions"
                                          value={activeSessionSimilarity}
                                          tone="sky"
                                        />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={8} className="max-w-sm rounded-xl border bg-popover p-0 text-popover-foreground shadow-md">
                                      {activeSessionMatch && activeSessionSimilarity > 0 ? (
                                        <MatchTooltipCard
                                          title="Best match | Active sessions"
                                          sessionTitle={activeSessionMatch.sessionTitle}
                                          currentDateKey={resolvedCurrentRow?.dateKey ?? null}
                                          source={
                                            activeSessionMatch.sourceAccountId
                                              ? accountPathLookup.get(activeSessionMatch.sourceAccountId) ??
                                                activeSessionMatch.sourceAccountId
                                              : "Unassigned"
                                          }
                                          destination={
                                            activeSessionMatch.destinationAccountId
                                              ? accountPathLookup.get(activeSessionMatch.destinationAccountId) ??
                                                activeSessionMatch.destinationAccountId
                                              : "Unmapped"
                                          }
                                          amount={
                                            activeSessionMatch.amount != null
                                              ? formatNumber(activeSessionMatch.amount)
                                              : "Unknown"
                                          }
                                          date={activeSessionMatch.dateKey ?? "Unknown"}
                                          description={activeSessionMatch.description || "-"}
                                          reference={activeSessionMatch.reference || "-"}
                                        />
                                      ) : (
                                        <NoMatchTooltipCard
                                          title="Best match | Active sessions"
                                          message="No similar row found in other active sessions."
                                        />
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="block w-full rounded-lg px-2 py-1 text-left transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      >
                                        <SimilarityBar
                                          label="Ledger"
                                          value={ledgerSimilarity}
                                          tone="emerald"
                                        />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={8} className="max-w-sm rounded-xl border bg-popover p-0 text-popover-foreground shadow-md">
                                      {ledgerMatch && ledgerSimilarity > 0 ? (
                                        <MatchTooltipCard
                                          title="Best match | Ledger"
                                          currentDateKey={resolvedCurrentRow?.dateKey ?? null}
                                          source={
                                            ledgerMatch.sourceAccountId
                                              ? accountPathLookup.get(ledgerMatch.sourceAccountId) ??
                                                ledgerMatch.sourceAccountId
                                              : "Unassigned"
                                          }
                                          destination={
                                            ledgerMatch.destinationAccountId
                                              ? accountPathLookup.get(ledgerMatch.destinationAccountId) ??
                                                ledgerMatch.destinationAccountId
                                              : "Unmapped"
                                          }
                                          amount={
                                            ledgerMatch.amount != null
                                              ? formatNumber(ledgerMatch.amount)
                                              : "Unknown"
                                          }
                                          date={ledgerMatch.dateKey ?? "Unknown"}
                                          description={ledgerMatch.description || "-"}
                                          reference={ledgerMatch.reference || "-"}
                                        />
                                      ) : (
                                        <NoMatchTooltipCard
                                          title="Best match | Ledger"
                                          message="No similar transaction found in the ledger."
                                        />
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              ) : (
                                <div className="min-w-44 rounded-xl border border-dashed bg-background/70 p-3 text-[11px] text-muted-foreground">
                                  Click reload in the header to compute similarity.
                                </div>
                              )}
                            </TooltipProvider>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

            </article>
          ) : null}
        </section>
      ) : null}
    </AppShell>
  )
}

function getSessionTitle(fileName: string | null) {
  return fileName ?? "Untitled import session"
}

function formatAccountDisplayLabel(accountType: string, accountPath: string) {
  if (!accountPath) {
    return accountType
  }

  return `${accountType} / ${accountPath}`
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

function formatMappingSource(mappingSource: string) {
  if (mappingSource === "manual") {
    return "Manual"
  }

  if (mappingSource === "learning") {
    return "Learning"
  }

  if (mappingSource === "seeded") {
    return "Seeded"
  }

  return "Unmapped"
}

function normalizeDescriptionValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function isUserImportSession(label: string | null | undefined) {
  return label === "user_imports" || label === "user_import_chunked"
}

function normalizeStrategyMode(value: string | null | undefined): StrategyMode {
  switch (value) {
    case "bayesian_statistics":
    case "nearest_neighbor":
    case "text_similarity":
    case "frequency_pattern":
    case "hybrid_ensemble":
    case "unassigned":
      return value
    default:
      return "unassigned"
  }
}

function resolveStrategyMode(session: ImportSession | null): StrategyMode {
  if (!session) {
    return "unassigned"
  }

  if (isUserImportSession(session.label)) {
    return "unassigned"
  }

  return normalizeStrategyMode(session.strategy)
}

function formatStrategyLabel(strategy: StrategyMode) {
  switch (strategy) {
    case "bayesian_statistics":
      return "Bayesian Statistics"
    case "nearest_neighbor":
      return "Nearest Neighbor"
    case "text_similarity":
      return "Text Similarity"
    case "frequency_pattern":
      return "Frequency Pattern"
    case "hybrid_ensemble":
      return "Hybrid Ensemble"
    default:
      return "Unassigned"
  }
}

function getSessionCardTitle(fileName: string | null) {
  const title = getSessionTitle(fileName)

  if (title.length <= 28) {
    return title
  }

  return `${title.slice(0, 28)}...`
}

function getColumnLabel(
  columnMappings: Record<number, string>,
  valueIndex: number,
) {
  const mappedValue = columnMappings[valueIndex]

  if (!mappedValue || mappedValue === "unmapped") {
    return `Column ${valueIndex + 1}`
  }

  return mappedValue
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function resolveSessionRow(
  session: ImportSession,
  row: ImportSessionRow,
): ResolvedSessionRow | null {
  const sourceAccountId = session.sourceAccountId
  const destinationAccountId = row.destinationAccountId

  if (!sourceAccountId && !destinationAccountId) {
    return null
  }

  return {
    sessionId: session.id,
    sessionTitle: getSessionTitle(session.fileName),
    rowId: row.id,
    rowIndex: row.rowIndex,
    dateKey: resolveMappedDateKey(row.values, session.columnMappings),
    description: resolveMappedText(row.values, session.columnMappings, "description"),
    reference: resolveMappedText(row.values, session.columnMappings, "reference"),
    amount: resolveMappedAmount(row.values, session.columnMappings),
    sourceAccountId,
    destinationAccountId,
  }
}

function resolveLedgerTransaction(transaction: Transaction): ResolvedLedgerTransaction | null {
  const splits = transaction.splits
  if (splits.length < 2) {
    return null
  }

  const sourceSplit =
    splits.find((split) => split.amount < 0) ?? splits.reduce((current, split) => (split.amount < current.amount ? split : current), splits[0])
  const destinationSplit =
    splits.find((split) => split.amount > 0) ?? splits.find((split) => split.id !== sourceSplit.id) ?? null

  return {
    transactionId: transaction.id,
    dateKey: normalizeDateKey(transaction.transactionDate),
    description: transaction.description.trim().toLowerCase(),
    reference: (transaction.referenceNumber ?? "").trim().toLowerCase(),
    amount: sourceSplit ? Math.abs(sourceSplit.amount) * (sourceSplit.amount >= 0 ? 1 : -1) : null,
    sourceAccountId: sourceSplit?.accountId ?? null,
    destinationAccountId: destinationSplit?.accountId ?? null,
  }
}

function resolveMappedText(
  values: string[],
  columnMappings: Record<number, string>,
  fieldName: string,
) {
  const columnIndex = findMappedColumnIndex(columnMappings, fieldName)
  if (columnIndex == null || columnIndex < 0 || columnIndex >= values.length) {
    return ""
  }

  return String(values[columnIndex] ?? "").trim().toLowerCase()
}

function resolveMappedDateKey(values: string[], columnMappings: Record<number, string>) {
  const rawDate = resolveMappedText(values, columnMappings, "date")
  if (!rawDate) {
    return null
  }

  return normalizeDateKey(rawDate)
}

function normalizeDateKey(rawDate: string) {
  const parsed = new Date(rawDate)
  if (Number.isNaN(parsed.getTime())) {
    return rawDate
  }

  return parsed.toISOString().slice(0, 10)
}

function resolveMappedAmount(values: string[], columnMappings: Record<number, string>) {
  const deposit = resolveMappedNumber(values, columnMappings, "amount")
  const withdrawal = resolveMappedNumber(values, columnMappings, "amount_negate")

  if (deposit == null && withdrawal == null) {
    return null
  }

  if (deposit != null && withdrawal != null) {
    return deposit - Math.abs(withdrawal)
  }

  return deposit != null ? deposit : -Math.abs(withdrawal ?? 0)
}

function resolveMappedNumber(
  values: string[],
  columnMappings: Record<number, string>,
  fieldName: string,
) {
  const columnIndex = findMappedColumnIndex(columnMappings, fieldName)
  if (columnIndex == null || columnIndex < 0 || columnIndex >= values.length) {
    return null
  }

  const rawValue = String(values[columnIndex] ?? "").trim()
  if (!rawValue) {
    return null
  }

  const normalized = rawValue.replace(/,/g, "")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function findMappedColumnIndex(
  columnMappings: Record<number, string>,
  fieldName: string,
) {
  const match = Object.entries(columnMappings).find(([, value]) => value === fieldName)
  return match ? Number(match[0]) : null
}

function scoreResolvedRows(left: ResolvedSessionRow, right: ResolvedSessionRow) {
  const dateScore =
    left.dateKey && right.dateKey ? (left.dateKey === right.dateKey ? 1 : 0) : 0
  const descriptionScore = scoreTextSimilarity(left.description, right.description)
  const referenceScore = scoreTextSimilarity(left.reference, right.reference)
  const amountScore = scoreAmountSimilarity(left.amount, right.amount)

  return dateScore * 0.3 + descriptionScore * 0.35 + referenceScore * 0.15 + amountScore * 0.2
}

function scoreLedgerMatch(left: ResolvedSessionRow, right: ResolvedLedgerTransaction) {
  const dateScore =
    left.dateKey && right.dateKey ? (left.dateKey === right.dateKey ? 1 : 0) : 0
  const descriptionScore = scoreTextSimilarity(left.description, right.description)
  const referenceScore = scoreTextSimilarity(left.reference, right.reference)
  const amountScore = scoreAmountSimilarity(left.amount, right.amount)

  return dateScore * 0.3 + descriptionScore * 0.35 + referenceScore * 0.15 + amountScore * 0.2
}

function scoreTextSimilarity(left: string, right: string) {
  if (!left || !right) {
    return 0
  }

  if (left === right) {
    return 1
  }

  const leftTokens = new Set(left.split(/\s+/).filter(Boolean))
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean))
  const intersectionSize = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length
  const unionSize = new Set([...leftTokens, ...rightTokens]).size

  return unionSize === 0 ? 0 : intersectionSize / unionSize
}

function scoreAmountSimilarity(left: number | null, right: number | null) {
  if (left == null || right == null) {
    return 0
  }

  const delta = Math.abs(left - right)
  const scale = Math.max(Math.abs(left), Math.abs(right), 1)
  return Math.max(0, 1 - delta / scale)
}


type MatchTooltipCardProps = {
  title: string
  sessionTitle?: string
  currentDateKey: string | null
  source: string
  destination: string
  amount: string
  date: string
  description: string
  reference: string
}

function MatchTooltipCard({
  title,
  sessionTitle,
  currentDateKey,
  source,
  destination,
  amount,
  date,
  description,
  reference,
}: MatchTooltipCardProps) {
  const isDateMismatch =
    currentDateKey != null &&
    currentDateKey !== "Unknown" &&
    date !== "Unknown" &&
    currentDateKey !== date

  return (
    <div className="w-[22rem] rounded-xl border bg-popover text-popover-foreground">
      <div className="border-b px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </p>
        {sessionTitle ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Session: {sessionTitle}
          </p>
        ) : null}
      </div>
      <div className="grid gap-1.5 px-3 py-3 text-[11px] leading-snug">
        <p><span className="font-semibold text-muted-foreground">Source:</span> {source}</p>
        <p><span className="font-semibold text-muted-foreground">Destination:</span> {destination}</p>
        <p><span className="font-semibold text-muted-foreground">Amount:</span> {amount}</p>
        <p className={isDateMismatch ? "text-destructive" : ""}>
          <span className="font-semibold text-muted-foreground">Date:</span> {date}
        </p>
        <p><span className="font-semibold text-muted-foreground">Description:</span> {description}</p>
        <p><span className="font-semibold text-muted-foreground">Reference:</span> {reference}</p>
      </div>
    </div>
  )
}

type NoMatchTooltipCardProps = {
  title: string
  message: string
}

function NoMatchTooltipCard({ title, message }: NoMatchTooltipCardProps) {
  return (
    <div className="w-[22rem] rounded-xl border bg-popover text-popover-foreground">
      <div className="border-b px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </p>
      </div>
      <div className="flex items-start gap-3 px-3 py-3">
        <div className="rounded-lg border bg-muted/50 p-2 text-muted-foreground">
          <SearchX className="size-4" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">No match</p>
          <p className="text-[11px] leading-snug text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  )
}

type SimilarityBarProps = {
  label: string
  value: number
  tone: "sky" | "emerald"
}

function SimilarityBar({ label, value, tone }: SimilarityBarProps) {
  const width = `${Math.round(value * 100)}%`
  const barClass =
    tone === "sky" ? "bg-sky-500 dark:bg-sky-400" : "bg-emerald-500 dark:bg-emerald-400"

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barClass}`} style={{ width }} />
      </div>
    </div>
  )
}

function getAccountTypePresentation(accountType: number | string | null) {
  if (accountType === 5 || accountType === "Expense") {
    return {
      label: "Expense",
      rowClass: "bg-rose-50/70 dark:bg-rose-950/20",
      icon: ArrowDownCircle,
      iconClass: "text-rose-600 dark:text-rose-400",
    }
  }

  if (accountType === 4 || accountType === "Income") {
    return {
      label: "Income",
      rowClass: "bg-emerald-50/70 dark:bg-emerald-950/20",
      icon: ArrowUpCircle,
      iconClass: "text-emerald-600 dark:text-emerald-400",
    }
  }

  if (accountType === 1 || accountType === "Asset") {
    return {
      label: "Asset",
      rowClass: "bg-sky-50/70 dark:bg-sky-950/20",
      icon: Landmark,
      iconClass: "text-sky-600 dark:text-sky-400",
    }
  }

  if (accountType === 2 || accountType === "Liability") {
    return {
      label: "Liability",
      rowClass: "bg-amber-50/70 dark:bg-amber-950/20",
      icon: Briefcase,
      iconClass: "text-amber-600 dark:text-amber-400",
    }
  }

  return {
    label: "Unmapped",
    rowClass: "",
    icon: CircleDashed,
    iconClass: "text-muted-foreground",
  }
}
