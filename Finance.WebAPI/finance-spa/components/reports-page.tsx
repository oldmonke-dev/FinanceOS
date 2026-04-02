"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ResponsiveSankey } from "@nivo/sankey"
import type { SankeyLinkDatum, SankeyNodeDatum } from "@nivo/sankey"
import { ArrowUpRight, BarChart3, ChevronDown, PieChart, Waypoints, X } from "lucide-react"
import { useTheme } from "next-themes"

import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { useImportSessions } from "@/components/providers/import-sessions-provider"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { buildAccountTree, formatAccountType } from "@/lib/accounts"
import { getBalanceDeltaForAccount } from "@/lib/accounting"
import { getTransactionDateKey, isTransactionDateInRange, parseDateKeyToLocalDate } from "@/lib/transaction-date"
import { getTransactions } from "@/lib/transactions"
import { cn } from "@/lib/utils"
import type { Account, AccountNode } from "@/models/account"
import type { Transaction } from "@/models/transaction"

type ImportSessionFilter = "all" | "archived" | "active" | "none"
type DateRangeMode = "custom" | "fy" | "ay"

type FlowLink = {
  source: string
  target: string
  value: number
  sourceAccountId?: string
  targetAccountId?: string
  sourceStage?: number
  targetStage?: number
}

type SankeyNodeData = {
  id: string
  label: string
  kind: "source" | "mid" | "target"
  stage?: number
}

export function ReportsPage() {
  const { accounts, isLoading: isLoadingAccounts, errorMessage: accountsError } = useAccounts()
  const { sessions, errorMessage: sessionsError } = useImportSessions()
  const { preference, formatNumber } = useUserPreferences()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true)
  const [transactionsError, setTransactionsError] = useState<string | null>(null)
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>("custom")
  const [customDateFrom, setCustomDateFrom] = useState("")
  const [customDateTo, setCustomDateTo] = useState("")
  const [selectedFiscalYearStart, setSelectedFiscalYearStart] = useState("")
  const [isAccountPopupOpen, setIsAccountPopupOpen] = useState(false)
  const accountPopupRef = useRef<HTMLDivElement | null>(null)
  const [accountQuery, setAccountQuery] = useState("")
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set())
  const [collapsedAccountIds, setCollapsedAccountIds] = useState<Set<string>>(new Set())
  const [importSessionFilter, setImportSessionFilter] = useState<ImportSessionFilter>("all")
  const [monthlyTrendPage, setMonthlyTrendPage] = useState(1)

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
  const reportableAccountIds = useMemo(
    () =>
      new Set(
        accounts
          .filter((account) => account.reportingMode === "Included")
          .map((account) => account.id),
      ),
    [accounts],
  )
  const filteredAccountTree = useMemo(
    () => filterAccountTree(accountTree, accountQuery.trim().toLowerCase()),
    [accountQuery, accountTree],
  )

  useEffect(() => {
    setCollapsedAccountIds(new Set(collectExpandableAccountIds(accountTree)))
  }, [accountTree])

  const importSessionStatusByTransactionId = useMemo(() => {
    const statusByTransactionId = new Map<string, "archived" | "active">()

    sessions.forEach((session) => {
      session.rows.forEach((row) => {
        if (!row.postedTransactionId) {
          return
        }

        statusByTransactionId.set(row.postedTransactionId, session.isArchived ? "archived" : "active")
      })
    })

    return statusByTransactionId
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

        setTransactions(nextTransactions)
        setTransactionsError(null)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setTransactions([])
        setTransactionsError(
          error instanceof Error ? error.message : "Failed to load report transactions.",
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

  const transactionDateRange = useMemo(() => {
    if (transactions.length === 0) {
      return { earliest: "", latest: "" }
    }

    const sortedDates = transactions
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
  }, [transactions])

  useEffect(() => {
    if (!transactionDateRange.earliest || !transactionDateRange.latest) {
      return
    }

    setCustomDateFrom((current) => current || transactionDateRange.earliest)
    setCustomDateTo((current) => current || transactionDateRange.latest)
  }, [transactionDateRange.earliest, transactionDateRange.latest])

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

    window.addEventListener("mousedown", handlePointerDown)

    return () => {
      window.removeEventListener("mousedown", handlePointerDown)
    }
  }, [isAccountPopupOpen])

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
    return transactions.filter((transaction) => {
      if (!isTransactionDateInRange(transaction.transactionDate, effectiveDateRange)) {
        return false
      }

      if (
        selectedAccountIds.size > 0 &&
        !transaction.splits.some((split) => selectedAccountIds.has(split.accountId))
      ) {
        return false
      }

      const importSessionStatus = importSessionStatusByTransactionId.get(transaction.id) ?? "none"
      if (importSessionFilter !== "all" && importSessionStatus !== importSessionFilter) {
        return false
      }

      if (!transaction.splits.some((split) => reportableAccountIds.has(split.accountId))) {
        return false
      }

      return true
    })
  }, [effectiveDateRange.from, effectiveDateRange.to, importSessionFilter, importSessionStatusByTransactionId, reportableAccountIds, selectedAccountIds, transactions])

  const expenseBalancesByAccount = useMemo(() => {
    const totals = new Map<string, number>()
    const reportEndTime = effectiveDateRange.to
      ? new Date(`${effectiveDateRange.to}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY

    accounts.forEach((account) => {
      const isExpense = account.accountType === 5 || account.accountType === "Expense"
      if (!isExpense) {
        return
      }

      if (!reportableAccountIds.has(account.id)) {
        return
      }

      if (selectedAccountIds.size > 0 && !selectedAccountIds.has(account.id)) {
        return
      }

      totals.set(account.id, account.openingBalance)
    })

    transactions.forEach((transaction) => {
      const transactionDate = new Date(transaction.transactionDate)
      const transactionTime = transactionDate.getTime()
      if (Number.isNaN(transactionTime) || transactionTime > reportEndTime) {
        return
      }

      const importSessionStatus = importSessionStatusByTransactionId.get(transaction.id) ?? "none"
      if (importSessionFilter !== "all" && importSessionStatus !== importSessionFilter) {
        return
      }

      transaction.splits.forEach((split) => {
        if (!totals.has(split.accountId)) {
          return
        }

        const account = accounts.find((item) => item.id === split.accountId)
        if (!account) {
          return
        }

        const nextValue =
          (totals.get(split.accountId) ?? 0) + getBalanceDeltaForAccount(account.accountType, split)
        totals.set(split.accountId, nextValue)
      })
    })

    return totals
  }, [accounts, effectiveDateRange.to, importSessionFilter, importSessionStatusByTransactionId, reportableAccountIds, selectedAccountIds, transactions])

  const expenseByAccount = useMemo(() => {
    return [...expenseBalancesByAccount.entries()]
      .filter(([, value]) => value > 0)
      .map(([accountId, value]) => ({
        id: accountId,
        label: accountPathLookup.get(accountId) ?? accountId,
        value,
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 6)
  }, [accountPathLookup, expenseBalancesByAccount])

  const monthlyTotals = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>()

    filteredTransactions.forEach((transaction) => {
      const date = new Date(transaction.transactionDate)
      if (Number.isNaN(date.getTime())) {
        return
      }

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      const current = totals.get(monthKey) ?? { income: 0, expense: 0 }

      transaction.splits.forEach((split) => {
        const account = accounts.find((item) => item.id === split.accountId)
        if (!account) {
          return
        }

        if (!reportableAccountIds.has(account.id)) {
          return
        }

        const isExpense = account.accountType === 5 || account.accountType === "Expense"
        const isIncome = account.accountType === 4 || account.accountType === "Income"
        const delta = getBalanceDeltaForAccount(account.accountType, split)

        if (isExpense && delta > 0) {
          current.expense += delta
        }

        if (isIncome && delta > 0) {
          current.income += delta
        }
      })

      totals.set(monthKey, current)
    })

    return [...totals.entries()]
      .map(([month, value]) => ({
        month,
        income: value.income,
        expense: value.expense,
      }))
      .sort((left, right) => left.month.localeCompare(right.month))
  }, [accounts, filteredTransactions, reportableAccountIds])

  useEffect(() => {
    setMonthlyTrendPage(1)
  }, [monthlyTotals.length, dateRangeMode, selectedFiscalYearStart, customDateFrom, customDateTo])

  const monthlyTrendPageSize = 10
  const monthlyTrendTotalPages = Math.max(1, Math.ceil(monthlyTotals.length / monthlyTrendPageSize))
  const pagedMonthlyTotals = useMemo(() => {
    const startIndex = (monthlyTrendPage - 1) * monthlyTrendPageSize
    return monthlyTotals.slice(startIndex, startIndex + monthlyTrendPageSize)
  }, [monthlyTotals, monthlyTrendPage])

  const sankeyScopedTransactions = useMemo(() => {
    const reportEndTime = effectiveDateRange.to
      ? new Date(`${effectiveDateRange.to}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY

    return transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.transactionDate)
      const transactionTime = transactionDate.getTime()
      if (Number.isNaN(transactionTime) || transactionTime > reportEndTime) {
        return false
      }

      if (
        selectedAccountIds.size > 0 &&
        !transaction.splits.some((split) => selectedAccountIds.has(split.accountId))
      ) {
        return false
      }

      const importSessionStatus = importSessionStatusByTransactionId.get(transaction.id) ?? "none"
      if (importSessionFilter !== "all" && importSessionStatus !== importSessionFilter) {
        return false
      }

      if (!transaction.splits.some((split) => reportableAccountIds.has(split.accountId))) {
        return false
      }

      return true
    })
  }, [effectiveDateRange.to, importSessionFilter, importSessionStatusByTransactionId, reportableAccountIds, selectedAccountIds, transactions])

  const compactSankeyLinks = useMemo(() => {
    const accountById = new Map(accounts.map((account) => [account.id, account]))
    return alignSankeyLinksToExpenseBalances(
      buildDistributedSankeyLinks(sankeyScopedTransactions, accountPathLookup, accountById),
      expenseBalancesByAccount,
      accountPathLookup,
      accountById,
    )
      .filter(
        (link) =>
          selectedAccountIds.size === 0 ||
          (selectedAccountIds.has(link.sourceAccountId ?? "") &&
            selectedAccountIds.has(link.targetAccountId ?? "")),
      )
      .sort((left, right) => right.value - left.value)
      .slice(0, 8)
  }, [accountPathLookup, accounts, expenseBalancesByAccount, sankeyScopedTransactions, selectedAccountIds])

  const detailedSankeyLinks = useMemo(() => {
    const accountById = new Map(accounts.map((account) => [account.id, account]))
    return alignSankeyLinksToExpenseBalances(
      buildDistributedSankeyLinks(sankeyScopedTransactions, accountPathLookup, accountById),
      expenseBalancesByAccount,
      accountPathLookup,
      accountById,
    )
      .filter(
        (link) =>
          selectedAccountIds.size === 0 ||
          (selectedAccountIds.has(link.sourceAccountId ?? "") &&
            selectedAccountIds.has(link.targetAccountId ?? "")),
      )
      .sort((left, right) => right.value - left.value)
      .slice(0, 14)
  }, [accountPathLookup, accounts, expenseBalancesByAccount, sankeyScopedTransactions, selectedAccountIds])

  const reportVolume = filteredTransactions.length
  const totalExpenses = [...expenseBalancesByAccount.values()].reduce((sum, value) => sum + value, 0)
  const totalIncome = monthlyTotals.reduce((sum, item) => sum + item.income, 0)

  return (
    <AppShell
      title="Reports"
      subtitle="Composition, trend, and flow analytics"
      badge={isLoadingTransactions ? "Loading reports" : `${reportVolume} transactions in scope`}
    >
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
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
          {dateRangeMode === "custom" ? (
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
          ) : (
            <div className="min-w-[16rem] space-y-1 text-xs">
              <span className="font-medium text-muted-foreground">Range</span>
              <div className="flex h-8 items-center rounded-lg border border-input bg-background px-2.5 text-xs text-muted-foreground">
                {effectiveDateRange.from && effectiveDateRange.to
                  ? `${effectiveDateRange.from} to ${effectiveDateRange.to}`
                  : "No range selected"}
              </div>
            </div>
          )}
          <label className="min-w-[12rem] space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Import session</span>
            <Select value={importSessionFilter} onValueChange={(value) => setImportSessionFilter(value as ImportSessionFilter)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="none">No import session</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div ref={accountPopupRef} className="relative min-w-[14rem] flex-1 space-y-1 text-xs md:max-w-[18rem]">
            <span className="font-medium text-muted-foreground">Accounts</span>
            <button
              type="button"
              onClick={() => setIsAccountPopupOpen((current) => !current)}
              className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-background px-2.5 text-left text-xs hover:bg-muted"
              disabled={isLoadingAccounts}
            >
              <span className="truncate">
                {selectedAccountIds.size === 0
                  ? "All accounts"
                  : `${selectedAccountIds.size} account${selectedAccountIds.size === 1 ? "" : "s"} selected`}
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
                    <button
                      type="button"
                      onClick={() => setCollapsedAccountIds(new Set(collectExpandableAccountIds(filteredAccountTree)))}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Collapse all
                    </button>
                    <button
                      type="button"
                      onClick={() => setCollapsedAccountIds(new Set())}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Expand all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAccountIds(new Set())}
                      className="text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      disabled={selectedAccountIds.size === 0}
                    >
                      Clear all
                    </button>
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
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Transactions" value={String(reportVolume)} />
          <MetricCard label="Income" value={formatNumber(totalIncome)} />
          <MetricCard label="Expenses" value={formatNumber(totalExpenses)} />
        </div>

        {accountsError ? <InlineError message={accountsError} /> : null}
        {sessionsError ? <InlineError message={sessionsError} /> : null}
        {transactionsError ? <InlineError message={transactionsError} /> : null}
      </section>

      {isLoadingTransactions || isLoadingAccounts ? (
        <section className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground shadow-sm">
          Loading report visuals...
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
          <article className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <PieChart className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Expense Mix</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Top expense accounts in the current report scope.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-[14rem_1fr]">
              <ExpensePieChart items={expenseByAccount} />
              <div className="space-y-2">
                {expenseByAccount.map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background/70 px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="size-3 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <span className="shrink-0 font-medium">{formatNumber(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-primary" />
                <h2 className="text-base font-semibold">Monthly Trend</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setMonthlyTrendPage((current) => Math.max(1, current - 1))}
                  className="rounded-md border bg-background px-2 py-1 hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                  disabled={monthlyTrendPage === 1}
                >
                  Previous
                </button>
                <span>{monthlyTrendPage} / {monthlyTrendTotalPages}</span>
                <button
                  type="button"
                  onClick={() => setMonthlyTrendPage((current) => Math.min(monthlyTrendTotalPages, current + 1))}
                  className="rounded-md border bg-background px-2 py-1 hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                  disabled={monthlyTrendPage === monthlyTrendTotalPages}
                >
                  Next
                </button>
              </div>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Income and expense movement by month, with Indian FY and AY period controls.
            </p>
            <div className="mt-4 h-[19rem] w-full overflow-hidden">
              <MonthlyTrendChart items={pagedMonthlyTotals} formatNumber={formatNumber} />
            </div>
          </article>

          <article className="rounded-2xl border bg-card p-5 shadow-sm xl:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Waypoints className="size-4 text-primary" />
                  <h2 className="text-base font-semibold">Account Flow</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Compact two-column flow for quick reading. Open the full-screen flow map for a clearer multi-stage money path.
                </p>
              </div>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="Open full-screen flow map">
                    <ArrowUpRight className="size-4" />
                    <span>Flow Map</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="top"
                  className="inset-0 h-screen max-h-none w-screen max-w-none overflow-y-auto rounded-none border-0 bg-background/98 p-0"
                >
                  <SheetHeader className="border-b bg-background/95">
                    <SheetTitle>Money Flow Map</SheetTitle>
                    <SheetDescription>
                      Full-screen multi-stage flow showing how money moves from income through accounts into expenses and liabilities.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="space-y-6 p-5">
                    <SankeyChart
                      links={detailedSankeyLinks}
                      formatNumber={formatNumber}
                      numberGroupingStyle={preference?.numberGroupingStyle ?? "international"}
                      layout="detailed"
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <div className="mt-4">
              <SankeyChart
                links={compactSankeyLinks}
                formatNumber={formatNumber}
                numberGroupingStyle={preference?.numberGroupingStyle ?? "international"}
                layout="compact"
              />
            </div>
          </article>
        </section>
      )}
    </AppShell>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/70 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      {message}
    </div>
  )
}

const chartColors = ["#0f766e", "#0369a1", "#7c3aed", "#b45309", "#be123c", "#4d7c0f"]

function ExpensePieChart({ items }: { items: Array<{ id: string; label: string; value: number }> }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)

  if (items.length === 0 || total === 0) {
    return <EmptyChartState message="No expense data for the selected scope." />
  }

  const radius = 58
  const center = 72
  const slices = items.map((item) => {
    const previousTotal = items
      .slice(0, items.indexOf(item))
      .reduce((sum, current) => sum + current.value, 0)

    return {
      ...item,
      startAngle: (previousTotal / total) * Math.PI * 2 - Math.PI / 2,
      endAngle: ((previousTotal + item.value) / total) * Math.PI * 2 - Math.PI / 2,
    }
  })

  return (
    <svg viewBox="0 0 144 144" className="mx-auto h-56 w-56">
      {slices.map((item, index) => {
        const largeArcFlag = item.endAngle - item.startAngle > Math.PI ? 1 : 0
        const startX = center + Math.cos(item.startAngle) * radius
        const startY = center + Math.sin(item.startAngle) * radius
        const endX = center + Math.cos(item.endAngle) * radius
        const endY = center + Math.sin(item.endAngle) * radius

        return (
          <path
            key={item.id}
            d={`M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`}
            fill={chartColors[index % chartColors.length]}
            stroke="white"
            strokeWidth="1.5"
          />
        )
      })}
      <circle cx={center} cy={center} r="28" fill="white" />
      <text x={center} y={center - 4} textAnchor="middle" className="fill-zinc-500 text-[8px]">
        Expenses
      </text>
      <text x={center} y={center + 12} textAnchor="middle" className="fill-zinc-900 text-[10px] font-semibold">
        {items.length}
      </text>
    </svg>
  )
}

function MonthlyTrendChart({
  items,
  formatNumber,
}: {
  items: Array<{ month: string; income: number; expense: number }>
  formatNumber: (value: number, fractionDigits?: number) => string
}) {
  if (items.length === 0) {
    return <EmptyChartState message="No monthly totals available." />
  }

  const maxValue = Math.max(...items.flatMap((item) => [item.income, item.expense]), 1)
  const chartHeight = 180
  const chartWidth = Math.max(items.length * 96, 760)
  const barWidth = 18
  const chartStartX = 52
  const chartEndX = chartWidth - 20
  const usableWidth = chartEndX - chartStartX
  const groupSpacing = usableWidth / items.length
  const groupInnerWidth = Math.max(barWidth * 2 + 8, groupSpacing * 0.7)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-emerald-500" />
          Income
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-rose-500" />
          Expense
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight + 36}`}
          className="h-[13.5rem] w-[26rem] min-w-full"
          preserveAspectRatio="none"
        >
          <line x1={chartStartX} y1={chartHeight} x2={chartEndX} y2={chartHeight} stroke="#cbd5e1" strokeWidth="1" />
          {items.map((item, index) => {
            const groupX = chartStartX + index * groupSpacing + (groupSpacing - groupInnerWidth) / 2
            const incomeHeight = (item.income / maxValue) * (chartHeight - 32)
            const expenseHeight = (item.expense / maxValue) * (chartHeight - 32)
            const incomeX = groupX
            const expenseX = groupX + groupInnerWidth - barWidth
            const incomeLabelX = incomeX + barWidth / 2
            const expenseLabelX = expenseX + barWidth / 2
            const centerX = groupX + groupInnerWidth / 2

            return (
              <g key={item.month}>
                <rect
                  x={incomeX}
                  y={chartHeight - incomeHeight}
                  width={barWidth}
                  height={incomeHeight}
                  rx="5"
                  fill="#22c55e"
                />
                <rect
                  x={expenseX}
                  y={chartHeight - expenseHeight}
                  width={barWidth}
                  height={expenseHeight}
                  rx="5"
                  fill="#f43f5e"
                />
                <text x={incomeLabelX} y={chartHeight - incomeHeight - 6} textAnchor="middle" className="fill-zinc-600 text-[9px]">
                  {compactNumber(item.income)}
                </text>
                <text x={expenseLabelX} y={chartHeight - expenseHeight - 6} textAnchor="middle" className="fill-zinc-600 text-[9px]">
                  {compactNumber(item.expense)}
                </text>
                <text x={centerX} y={chartHeight + 14} textAnchor="middle" className="fill-zinc-700 text-[10px] font-medium">
                  {formatMonthLabel(item.month)}
                </text>
                <text x={centerX} y={chartHeight + 26} textAnchor="middle" className="fill-zinc-500 text-[9px]">
                  {formatNumber(item.income, 0)} / {formatNumber(item.expense, 0)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function SankeyChart({
  links,
  formatNumber,
  numberGroupingStyle,
  layout,
}: {
  links: FlowLink[]
  formatNumber: (value: number, fractionDigits?: number) => string
  numberGroupingStyle: "indian" | "international"
  layout: "compact" | "detailed"
}) {
  const { resolvedTheme } = useTheme()
  const sankeyLabelColor = "#0f172a"
  const sankeyColors = chartColors
  const formatCompactFlow = useMemo(
    () => createCompactFlowFormatter(numberGroupingStyle),
    [numberGroupingStyle],
  )
  const cleanedLinks = useMemo(
    () =>
      links.filter(
        (link) =>
          link.source.trim().length > 0 &&
          link.target.trim().length > 0 &&
          Number.isFinite(link.value) &&
          link.value > 0 &&
          link.source !== link.target &&
          (layout === "compact" || (link.targetStage ?? 0) > (link.sourceStage ?? -1)),
      ),
    [layout, links],
  )

  const { sanitizedLinks, hiddenSmallLinkCount } = useMemo(() => {
    const sortedLinks = [...cleanedLinks].sort((left, right) => right.value - left.value)

    const baselineVisibleCount = layout === "compact" ? 6 : 14
    if (sortedLinks.length <= baselineVisibleCount) {
      return { sanitizedLinks: sortedLinks, hiddenSmallLinkCount: 0 }
    }

    const largestVisibleFlow = sortedLinks[0]?.value ?? 0
    const minimumVisibleFlow = largestVisibleFlow * (layout === "compact" ? 0.05 : 0.02)
    const nextVisibleLinks = sortedLinks.filter(
      (link, index) => index < baselineVisibleCount || link.value >= minimumVisibleFlow,
    )

    return {
      sanitizedLinks: nextVisibleLinks,
      hiddenSmallLinkCount: sortedLinks.length - nextVisibleLinks.length,
    }
  }, [cleanedLinks, layout])

  if (sanitizedLinks.length === 0) {
    return <EmptyChartState message="No source-to-destination flow available." />
  }

  const nodesById = new Map<string, SankeyNodeData>()
  const incomingStagesByLabel = new Map<string, Set<number>>()
  const outgoingStagesByLabel = new Map<string, Set<number>>()

  sanitizedLinks.forEach((link) => {
    const sourceStage = link.sourceStage ?? 0
    const targetStage = link.targetStage ?? sourceStage + 1

    const outgoingStages = outgoingStagesByLabel.get(link.source) ?? new Set<number>()
    outgoingStages.add(sourceStage)
    outgoingStagesByLabel.set(link.source, outgoingStages)

    const incomingStages = incomingStagesByLabel.get(link.target) ?? new Set<number>()
    incomingStages.add(targetStage)
    incomingStagesByLabel.set(link.target, incomingStages)

    const sourceId = `${sourceStage}:::${link.source}`
    if (!nodesById.has(sourceId)) {
      nodesById.set(sourceId, {
        id: sourceId,
        label: link.source,
        kind: "source",
        stage: sourceStage,
      })
    }

    const targetId = `${targetStage}:::${link.target}`
    if (!nodesById.has(targetId)) {
      nodesById.set(targetId, {
        id: targetId,
        label: link.target,
        kind: "target",
        stage: targetStage,
      })
    }
  })

  const nodes: SankeyNodeData[] = [...nodesById.values()].map((node) => {
    const hasIncoming = (incomingStagesByLabel.get(node.label)?.size ?? 0) > 0
    const hasOutgoing = (outgoingStagesByLabel.get(node.label)?.size ?? 0) > 0

    return {
      ...node,
      kind: hasIncoming && hasOutgoing ? "mid" : hasIncoming ? "target" : "source",
    }
  })
  const sankeyData = {
    nodes,
    links: sanitizedLinks.map((link) => ({
      source: `${link.sourceStage ?? 0}:::${link.source}`,
      target: `${link.targetStage ?? (link.sourceStage ?? 0) + 1}:::${link.target}`,
      value: link.value,
    })),
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {layout === "compact"
            ? `Showing top ${sanitizedLinks.length} source-to-destination links in a compact two-column view.`
            : `Showing top ${sanitizedLinks.length} stage-to-stage links in the expanded multi-column view.`}
        </p>
        {hiddenSmallLinkCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            Hid {hiddenSmallLinkCount} very small flow{hiddenSmallLinkCount === 1 ? "" : "s"} to keep labels readable.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2 [&_svg_text]:fill-[#0f172a]">
        <div className={layout === "compact" ? "h-[34rem] min-h-[34rem]" : "h-[42rem] min-h-[42rem]"}>
          <ResponsiveSankey
            data={sankeyData}
            margin={
              layout === "compact"
                ? { top: 24, right: 180, bottom: 24, left: 180 }
                : { top: 24, right: 280, bottom: 24, left: 280 }
            }
            align="justify"
            sort="descending"
            colors={sankeyColors}
            nodeOpacity={1}
            nodeThickness={layout === "compact" ? 22 : 20}
            nodeSpacing={layout === "compact" ? 18 : 22}
            nodeBorderWidth={0}
            nodeBorderColor="#ffffff"
            linkOpacity={0.38}
            linkHoverOpacity={0.62}
            linkHoverOthersOpacity={0.15}
            linkContract={3}
            linkBlendMode="multiply"
            enableLinkGradient
            enableLabels
            label={(node) => {
              const labeledNode = node as unknown as SankeyNodeDatum<SankeyNodeData, FlowLink>
              return formatSankeyNodeLabel(labeledNode.label, labeledNode.value ?? 0, formatCompactFlow, layout)
            }}
            labelPosition={layout === "compact" ? "inside" : "outside"}
            labelOrientation="horizontal"
            labelPadding={layout === "compact" ? 10 : 18}
            labelTextColor={sankeyLabelColor}
            animate
            motionConfig="gentle"
            theme={{
              text: {
                fontSize: layout === "compact" ? 11 : 10,
                fill: "#334155",
              },
              tooltip: {
                container: {
                  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                  color: "#0f172a",
                  fontSize: "11px",
                  borderRadius: "12px",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.16)",
                  padding: "10px 12px",
                  minWidth: "52rem",
                  maxWidth: "60rem",
                  lineHeight: 1.35,
                },
              },
            }}
            nodeTooltip={({ node }: { node: SankeyNodeDatum<SankeyNodeData, FlowLink> }) => (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold leading-4" style={{ color: "#0f172a" }}>
                  {compactAccountPath(node.label)}
                </p>
                <p className="text-[10px] leading-4" style={{ color: "#475569" }}>
                  Stage: {getSankeyStageLabel(node.stage ?? 2)}
                </p>
                <p className="text-[10px] leading-4" style={{ color: "#475569" }}>
                  Total flow: {formatCompactFlow(node.value ?? 0)} ({formatNumber(node.value ?? 0)})
                </p>
              </div>
            )}
            linkTooltip={({ link }: { link: SankeyLinkDatum<SankeyNodeData, FlowLink> }) => (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold leading-4" style={{ color: "#0f172a" }}>
                  {getSankeyStageLabel((link.source as SankeyNodeDatum<SankeyNodeData, FlowLink>).stage ?? 2)} to{" "}
                  {getSankeyStageLabel((link.target as SankeyNodeDatum<SankeyNodeData, FlowLink>).stage ?? 2)}
                </p>
                <p className="text-[10px] leading-4" style={{ color: "#475569" }}>
                  <span className="font-medium" style={{ color: "#0f172a" }}>Source:</span> {link.source.label}
                </p>
                <p className="text-[10px] leading-4" style={{ color: "#475569" }}>
                  <span className="font-medium" style={{ color: "#0f172a" }}>To:</span> {link.target.label}
                </p>
                <p className="text-[10px] leading-4" style={{ color: "#475569" }}>
                  Value: {formatCompactFlow(link.value)} ({formatNumber(link.value)})
                </p>
              </div>
            )}
          />
        </div>
      </div>

      <div className={cn("mt-3 grid gap-2", layout === "compact" ? "md:grid-cols-2" : "xl:grid-cols-3")}>
        {sanitizedLinks.map((link, index) => (
          <div key={`${link.source}-${link.target}-${index}`} className="rounded-lg border bg-background/70 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ backgroundColor: sankeyColors[index % sankeyColors.length] }} />
              <span className="truncate">{link.source}</span>
              <span className="text-muted-foreground">to</span>
              <span className="truncate">{link.target}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCompactFlow(link.value)} ({formatNumber(link.value)})
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatSankeyNodeLabel(
  label: string,
  value: number,
  formatCompactFlow: (value: number) => string,
  layout: "compact" | "detailed",
) {
  if (layout === "compact") {
    return `${compactAccountPath(label, 16, 1)} ${formatCompactFlow(value)}`
  }

  const shortLabel = compactAccountPath(label, 18, 2)
  return `${shortLabel} ${formatCompactFlow(value)}`
}

function compactAccountPath(label: string, maxLength = 28, segmentsToKeep = 2) {
  const segments = label
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)

  const compactLabel = segments.slice(-segmentsToKeep).join(" / ") || label
  return compactLabel.length > maxLength ? `${compactLabel.slice(0, maxLength - 3)}...` : compactLabel
}

function AccountFlowColumns({
  links,
  formatNumber,
}: {
  links: FlowLink[]
  formatNumber: (value: number, fractionDigits?: number) => string
}) {
  const stages = useMemo(() => {
    const nodesByStage = new Map<number, Map<string, number>>()

    links.forEach((link) => {
      const sourceStage = link.sourceStage ?? 2
      const targetStage = link.targetStage ?? 2

      const sourceNodes = nodesByStage.get(sourceStage) ?? new Map<string, number>()
      sourceNodes.set(link.source, (sourceNodes.get(link.source) ?? 0) + link.value)
      nodesByStage.set(sourceStage, sourceNodes)

      const targetNodes = nodesByStage.get(targetStage) ?? new Map<string, number>()
      targetNodes.set(link.target, (targetNodes.get(link.target) ?? 0) + link.value)
      nodesByStage.set(targetStage, targetNodes)
    })

    return [...nodesByStage.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([stage, nodes]) => ({
        stage,
        label: getSankeyStageLabel(stage),
        nodes: [...nodes.entries()]
          .map(([label, value]) => ({ label, value }))
          .sort((left, right) => right.value - left.value),
      }))
  }, [links])

  if (stages.length === 0) {
    return null
  }

  return (
    <div className="rounded-2xl border bg-card/80 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Stage columns</h3>
        <p className="text-xs text-muted-foreground">
          Each column shows the strongest accounts at that step of the money path.
        </p>
      </div>

      <div className="grid gap-3 overflow-x-auto pb-1" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(15rem, 1fr))` }}>
        {stages.map((stage) => (
          <div key={stage.stage} className="rounded-xl border bg-background/70 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{stage.label}</h4>
              <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                {stage.nodes.length} node{stage.nodes.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="space-y-2">
              {stage.nodes.slice(0, 8).map((node) => (
                <div key={node.label} className="rounded-lg border bg-card px-3 py-2">
                  <p className="truncate text-sm font-medium">{node.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatNumber(node.value)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-xl border border-dashed bg-background/70 text-sm text-muted-foreground">
      {message}
    </div>
  )
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
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {formatAccountType(node.accountType)}
                  </span>
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
    const selfMatches =
      node.name.toLowerCase().includes(searchTerm) ||
      formatAccountType(node.accountType).toLowerCase().includes(searchTerm)
    const filteredChildren = node.children
      .map((child) => visit(child))
      .filter((child): child is AccountNode => child != null)

    if (!selfMatches && filteredChildren.length === 0) {
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

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(year, (month ?? 1) - 1, 1)
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function createCompactFlowFormatter(groupingStyle: "indian" | "international") {
  return (value: number) => {
    const absoluteValue = Math.abs(value)

    if (groupingStyle === "indian") {
      if (absoluteValue >= 10_000_000) {
        return `${formatCompactUnit(value / 10_000_000)} Cr`
      }

      if (absoluteValue >= 100_000) {
        return `${formatCompactUnit(value / 100_000)} L`
      }
    } else {
      if (absoluteValue >= 1_000_000_000) {
        return `${formatCompactUnit(value / 1_000_000_000)}B`
      }

      if (absoluteValue >= 1_000_000) {
        return `${formatCompactUnit(value / 1_000_000)}M`
      }
    }

    return new Intl.NumberFormat(groupingStyle === "indian" ? "en-IN" : "en-US", {
      notation: absoluteValue >= 1_000 ? "compact" : "standard",
      maximumFractionDigits: 1,
    }).format(value)
  }
}

function formatCompactUnit(value: number) {
  const roundedValue = Number(value.toFixed(1))
  return Number.isInteger(roundedValue) ? String(roundedValue) : String(roundedValue)
}

function buildDistributedSankeyLinks(
  transactions: Transaction[],
  accountPathLookup: Map<string, string>,
  accountById: Map<string, Account>,
) {
  const links = new Map<string, number>()
  const directTransactionAccountIds = new Set(
    transactions.flatMap((transaction) => transaction.splits.map((split) => split.accountId)),
  )

  function getSankeyAccountLabel(accountId: string) {
    const account = accountById.get(accountId)
    if (!account) {
      return accountPathLookup.get(accountId) ?? accountId
    }

    const segments: string[] = []
    let currentAccountId: string | null | undefined = accountId

    while (currentAccountId) {
      const currentAccount = accountById.get(currentAccountId)
      if (!currentAccount) {
        break
      }

      const isAssetAccount =
        currentAccount.accountType === 1 || currentAccount.accountType === "Asset"
      const shouldIncludeSegment =
        currentAccountId === accountId ||
        !isAssetAccount ||
        directTransactionAccountIds.has(currentAccountId)

      if (shouldIncludeSegment && currentAccount.name) {
        segments.unshift(currentAccount.name)
      }

      currentAccountId = currentAccount.parentAccountId
    }

    return segments.join(" / ") || (accountPathLookup.get(accountId) ?? accountId)
  }

  function addDistributedLink(
    sourceAccountId: string,
    targetAccountId: string,
    value: number,
  ) {
    if (value <= 0) {
      return
    }

    const sourceLabel = getSankeyAccountLabel(sourceAccountId)
    const targetLabel = getSankeyAccountLabel(targetAccountId)
    const sourceStage = getSankeyStage(accountById.get(sourceAccountId)?.accountType)
    const targetStage = getSankeyStage(accountById.get(targetAccountId)?.accountType)
    const { sourceColumn, targetColumn } = getSankeyColumnsForFlow(sourceStage, targetStage)
    const normalizedSourceLabel = sourceLabel
    const normalizedTargetLabel = targetLabel
    const normalizedSourceAccountId = sourceAccountId
    const normalizedTargetAccountId = targetAccountId
    const normalizedSourceStage = sourceColumn
    const normalizedTargetStage = targetColumn
    const key = `${normalizedSourceLabel}|||${normalizedTargetLabel}|||${normalizedSourceAccountId}|||${normalizedTargetAccountId}|||${normalizedSourceStage}|||${normalizedTargetStage}`

    links.set(key, (links.get(key) ?? 0) + value)
  }

  transactions.forEach((transaction) => {
    const splitDeltas = transaction.splits.map((split) => {
      const accountType = accountById.get(split.accountId)?.accountType
      const delta = getBalanceDeltaForAccount(accountType, split)
      return { split, delta, accountType }
    })

    const increasingSplits = splitDeltas
      .filter((entry) => entry.delta > 0)
      .map(({ split, delta }) => ({ split, delta }))

    const decreasingSplits = splitDeltas
      .filter((entry) => entry.delta < 0)
      .map(({ split, delta }) => ({ split, delta }))

    const incomeIncreasingSplits = splitDeltas
      .map((split) => {
        return split
      })
      .filter(
        (entry) =>
          entry.delta > 0 && (entry.accountType === 4 || entry.accountType === "Income"),
      )

    const assetIncreasingSplits = splitDeltas
      .map((split) => {
        return split
      })
      .filter(
        (entry) =>
          entry.delta > 0 && (entry.accountType === 1 || entry.accountType === "Asset"),
      )

    const totalDecreases = decreasingSplits.reduce((sum, entry) => sum + Math.abs(entry.delta), 0)

    if (increasingSplits.length > 0 && decreasingSplits.length > 0 && totalDecreases > 0) {
      increasingSplits.forEach(({ split: increasingSplit, delta: increasingDelta }) => {
        decreasingSplits.forEach(({ split: decreasingSplit, delta: decreasingDelta }) => {
          const distributedAmount = (Math.abs(decreasingDelta) / totalDecreases) * increasingDelta
          addDistributedLink(decreasingSplit.accountId, increasingSplit.accountId, distributedAmount)
        })
      })
      return
    }

    const totalIncomeIncrease = incomeIncreasingSplits.reduce((sum, entry) => sum + entry.delta, 0)
    if (incomeIncreasingSplits.length === 0 || assetIncreasingSplits.length === 0 || totalIncomeIncrease <= 0) {
      return
    }

    assetIncreasingSplits.forEach((targetEntry) => {
      incomeIncreasingSplits.forEach((sourceEntry) => {
        const distributedAmount = (sourceEntry.delta / totalIncomeIncrease) * targetEntry.delta
        addDistributedLink(sourceEntry.split.accountId, targetEntry.split.accountId, distributedAmount)
      })
    })
  })

  return [...links.entries()].map(([key, value]) => {
    const [source, target, sourceAccountId, targetAccountId, sourceStage, targetStage] = key.split("|||")
    return {
      source,
      target,
      value,
      sourceAccountId,
      targetAccountId,
      sourceStage: Number(sourceStage),
      targetStage: Number(targetStage),
    }
  })
}

function alignSankeyLinksToExpenseBalances(
  links: FlowLink[],
  expenseBalancesByAccount: Map<string, number>,
  accountPathLookup: Map<string, string>,
  accountById: Map<string, Account>,
) {
  const adjustedLinks = [...links]

  expenseBalancesByAccount.forEach((expenseBalance, accountId) => {
    if (expenseBalance <= 0) {
      return
    }

    const expenseStage = getSankeyStage(accountById.get(accountId)?.accountType)
    const incomingIndexes = adjustedLinks
      .map((link, index) => ({ link, index }))
      .filter(({ link }) => link.targetAccountId === accountId && link.targetStage === expenseStage)

    const currentIncomingTotal = incomingIndexes.reduce((sum, item) => sum + item.link.value, 0)

    if (currentIncomingTotal > 0) {
      const scale = expenseBalance / currentIncomingTotal
      incomingIndexes.forEach(({ index }) => {
        adjustedLinks[index] = {
          ...adjustedLinks[index],
          value: adjustedLinks[index].value * scale,
        }
      })
      return
    }

    adjustedLinks.push({
      source: "Opening balances",
      target: accountPathLookup.get(accountId) ?? accountId,
      value: expenseBalance,
      sourceAccountId: "__opening_balances__",
      targetAccountId: accountId,
      sourceStage: -1,
      targetStage: expenseStage,
    })
  })

  return adjustedLinks
}

function getSankeyColumnsForFlow(sourceStage: number, targetStage: number) {
  if (sourceStage === 0 && targetStage === 1) {
    return { sourceColumn: 0, targetColumn: 1 }
  }

  if (sourceStage === 1 && targetStage === 1) {
    return { sourceColumn: 1, targetColumn: 2 }
  }

  if (sourceStage === 1 && targetStage === 2) {
    return { sourceColumn: 2, targetColumn: 3 }
  }

  if (sourceStage === 1 && targetStage === 3) {
    return { sourceColumn: 2, targetColumn: 3 }
  }

  if (sourceStage === 1 && targetStage === 4) {
    return { sourceColumn: 2, targetColumn: 3 }
  }

  const normalizedSourceStage = getSankeyBaseColumn(sourceStage)
  const normalizedTargetStage = Math.max(getSankeyBaseColumn(targetStage), normalizedSourceStage + 1)
  return { sourceColumn: normalizedSourceStage, targetColumn: normalizedTargetStage }
}

function getSankeyBaseColumn(stage: number) {
  if (stage === 0) {
    return 0
  }

  if (stage === 1) {
    return 1
  }

  if (stage === 2) {
    return 3
  }

  if (stage === 3) {
    return 3
  }

  if (stage === 4) {
    return 3
  }

  return Math.max(stage, 0)
}

function getSankeyStage(accountType: number | string | undefined) {
  if (accountType === 4 || accountType === "Income") {
    return 0
  }

  if (accountType === 1 || accountType === "Asset") {
    return 1
  }

  if (accountType === 3 || accountType === "Equity") {
    return 2
  }

  if (accountType === 5 || accountType === "Expense") {
    return 3
  }

  if (accountType === 2 || accountType === "Liability") {
    return 4
  }

  return 2
}

function getSankeyStageLabel(stage: number) {
  const normalizedStage = stage

  if (normalizedStage === -1) {
    return "Opening balances"
  }

  if (normalizedStage === 0) {
    return "Income"
  }

  if (normalizedStage === 1) {
    return "Assets In"
  }

  if (normalizedStage === 2) {
    return "Intra-Assets"
  }

  if (normalizedStage === 3) {
    return "Expenses / Liabilities"
  }

  return "Other"
}
