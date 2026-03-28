"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ResponsiveSankey } from "@nivo/sankey"
import type { SankeyLinkDatum, SankeyNodeDatum } from "@nivo/sankey"
import { BarChart3, ChevronDown, PieChart, Waypoints, X } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { useImportSessions } from "@/components/providers/import-sessions-provider"
import { useUserPreferences } from "@/components/providers/user-preferences-provider"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { buildAccountTree, formatAccountType } from "@/lib/accounts"
import { getTransactions } from "@/lib/transactions"
import { cn } from "@/lib/utils"
import type { AccountNode } from "@/models/account"
import type { Transaction } from "@/models/transaction"

type ImportSessionFilter = "all" | "archived" | "active" | "none"
type DateRangeMode = "custom" | "fy" | "ay"

type FlowLink = {
  source: string
  target: string
  value: number
}

type SankeyNodeData = {
  id: string
  label: string
  kind: "source" | "target"
}

export function ReportsPage() {
  const { accounts, isLoading: isLoadingAccounts, errorMessage: accountsError } = useAccounts()
  const { sessions, errorMessage: sessionsError } = useImportSessions()
  const { formatNumber } = useUserPreferences()
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
  const filteredAccountTree = useMemo(
    () => filterAccountTree(accountTree, accountQuery.trim().toLowerCase()),
    [accountQuery, accountTree],
  )

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
      .map((transaction) => new Date(transaction.transactionDate))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => left.getTime() - right.getTime())

    if (sortedDates.length === 0) {
      return { earliest: "", latest: "" }
    }

    return {
      earliest: sortedDates[0].toISOString().slice(0, 10),
      latest: sortedDates[sortedDates.length - 1].toISOString().slice(0, 10),
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

    const earliestDate = new Date(transactionDateRange.earliest)
    const latestDate = new Date(transactionDateRange.latest)

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
      const transactionDate = new Date(transaction.transactionDate)
      const transactionTime = transactionDate.getTime()

      if (effectiveDateRange.from) {
        const fromTime = new Date(`${effectiveDateRange.from}T00:00:00`).getTime()
        if (transactionTime < fromTime) {
          return false
        }
      }

      if (effectiveDateRange.to) {
        const toTime = new Date(`${effectiveDateRange.to}T23:59:59.999`).getTime()
        if (transactionTime > toTime) {
          return false
        }
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

      return true
    })
  }, [effectiveDateRange.from, effectiveDateRange.to, importSessionFilter, importSessionStatusByTransactionId, selectedAccountIds, transactions])

  const expenseByAccount = useMemo(() => {
    const totals = new Map<string, number>()

    filteredTransactions.forEach((transaction) => {
      transaction.splits.forEach((split) => {
        const account = accounts.find((item) => item.id === split.accountId)
        if (!account) {
          return
        }

        const isExpense = account.accountType === 5 || account.accountType === "Expense"
        if (!isExpense) {
          return
        }

        totals.set(split.accountId, (totals.get(split.accountId) ?? 0) + Math.abs(split.amount))
      })
    })

    return [...totals.entries()]
      .map(([accountId, value]) => ({
        id: accountId,
        label: accountPathLookup.get(accountId) ?? accountId,
        value,
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 6)
  }, [accountPathLookup, accounts, filteredTransactions])

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

        const isExpense = account.accountType === 5 || account.accountType === "Expense"
        const isIncome = account.accountType === 4 || account.accountType === "Income"

        if (isExpense) {
          current.expense += Math.abs(split.amount)
        }

        if (isIncome) {
          current.income += Math.abs(split.amount)
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
  }, [accounts, filteredTransactions])

  useEffect(() => {
    setMonthlyTrendPage(1)
  }, [monthlyTotals.length, dateRangeMode, selectedFiscalYearStart, customDateFrom, customDateTo])

  const monthlyTrendPageSize = 10
  const monthlyTrendTotalPages = Math.max(1, Math.ceil(monthlyTotals.length / monthlyTrendPageSize))
  const pagedMonthlyTotals = useMemo(() => {
    const startIndex = (monthlyTrendPage - 1) * monthlyTrendPageSize
    return monthlyTotals.slice(startIndex, startIndex + monthlyTrendPageSize)
  }, [monthlyTotals, monthlyTrendPage])

  const sankeyLinks = useMemo(() => {
    const links = new Map<string, number>()

    filteredTransactions.forEach((transaction) => {
      const negativeSplits = transaction.splits.filter((split) => split.amount < 0)
      const positiveSplits = transaction.splits.filter((split) => split.amount > 0)

      if (negativeSplits.length === 0 || positiveSplits.length === 0) {
        return
      }

      negativeSplits.forEach((sourceSplit) => {
        positiveSplits.forEach((targetSplit) => {
          const amount = Math.min(Math.abs(sourceSplit.amount), Math.abs(targetSplit.amount))
          if (amount <= 0) {
            return
          }

          const sourceLabel = accountPathLookup.get(sourceSplit.accountId) ?? sourceSplit.accountId
          const targetLabel = accountPathLookup.get(targetSplit.accountId) ?? targetSplit.accountId
          const key = `${sourceLabel}|||${targetLabel}`
          links.set(key, (links.get(key) ?? 0) + amount)
        })
      })
    })

    return [...links.entries()]
      .map(([key, value]) => {
        const [source, target] = key.split("|||")
        return { source, target, value }
      })
      .sort((left, right) => right.value - left.value)
      .slice(0, 8)
  }, [accountPathLookup, filteredTransactions])

  const reportVolume = filteredTransactions.length
  const totalExpenses = monthlyTotals.reduce((sum, item) => sum + item.expense, 0)
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
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    Compact tree multi-select
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedAccountIds(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    disabled={selectedAccountIds.size === 0}
                  >
                    Clear all
                  </button>
                </div>
                <div className="mt-2 max-h-72 overflow-y-auto pr-1">
                  {filteredAccountTree.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground">No accounts match.</p>
                  ) : (
                    <AccountTreeMultiSelect
                      nodes={filteredAccountTree}
                      selectedAccountIds={selectedAccountIds}
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
            <div className="flex items-center gap-2">
              <Waypoints className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Account Flow</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Sankey-style flow between negative and positive split accounts.
            </p>
            <div className="mt-4">
              <SankeyChart links={sankeyLinks} formatNumber={formatNumber} />
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
}: {
  links: FlowLink[]
  formatNumber: (value: number, fractionDigits?: number) => string
}) {
  const sanitizedLinks = useMemo(
    () =>
      links.filter(
        (link) =>
          link.source.trim().length > 0 &&
          link.target.trim().length > 0 &&
          Number.isFinite(link.value) &&
          link.value > 0 &&
          link.source !== link.target,
      ),
    [links],
  )

  if (sanitizedLinks.length === 0) {
    return <EmptyChartState message="No source-to-destination flow available." />
  }

  const sourceNodeIds = [...new Set(sanitizedLinks.map((link) => link.source))]
  const targetNodeIds = [...new Set(sanitizedLinks.map((link) => link.target))]
  const sourceIdByLabel = new Map(
    sourceNodeIds.map((label, index) => [label, `source-${index}`] as const),
  )
  const targetIdByLabel = new Map(
    targetNodeIds.map((label, index) => [label, `target-${index}`] as const),
  )
  const nodes: SankeyNodeData[] = [
    ...sourceNodeIds.map((label) => ({
      id: sourceIdByLabel.get(label) ?? label,
      label,
      kind: "source" as const,
    })),
    ...targetNodeIds.map((label) => ({
      id: targetIdByLabel.get(label) ?? label,
      label,
      kind: "target" as const,
    })),
  ]
  const sankeyData = {
    nodes,
    links: sanitizedLinks.map((link) => ({
      source: sourceIdByLabel.get(link.source) ?? link.source,
      target: targetIdByLabel.get(link.target) ?? link.target,
      value: link.value,
    })),
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Showing top {sanitizedLinks.length} aggregated source-to-destination account links.
        </p>
      </div>

      <div className="rounded-xl border bg-[linear-gradient(180deg,#ffffff_0%,#fafaf9_100%)] p-2">
        <div className="h-[34rem] min-h-[34rem]">
          <ResponsiveSankey
            data={sankeyData}
            margin={{ top: 24, right: 180, bottom: 24, left: 180 }}
            align="justify"
            sort="descending"
            colors={chartColors}
            nodeOpacity={1}
            nodeThickness={22}
            nodeSpacing={18}
            nodeBorderWidth={0}
            linkOpacity={0.38}
            linkHoverOpacity={0.62}
            linkContract={3}
            enableLinkGradient
            enableLabels
            label="label"
            labelPosition="inside"
            labelOrientation="horizontal"
            labelPadding={10}
            labelTextColor="#ffffff"
            animate
            motionConfig="gentle"
            theme={{
              text: {
                fontSize: 11,
                fill: "#334155",
              },
              tooltip: {
                container: {
                  background: "#ffffff",
                  color: "#0f172a",
                  fontSize: "12px",
                  borderRadius: "12px",
                  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
                  padding: "10px 12px",
                },
              },
            }}
            nodeTooltip={({ node }: { node: SankeyNodeDatum<SankeyNodeData, FlowLink> }) => (
              <div className="space-y-1">
                <p className="font-medium">{node.label}</p>
                <p className="text-muted-foreground">
                  Role: {node.kind === "source" ? "Source flow" : "Target flow"}
                </p>
                <p className="text-muted-foreground">Total flow: {formatNumber(node.value ?? 0)}</p>
              </div>
            )}
            linkTooltip={({ link }: { link: SankeyLinkDatum<SankeyNodeData, FlowLink> }) => (
              <div className="space-y-1">
                <p className="font-medium">
                  {String(link.source.id)} to {String(link.target.id)}
                </p>
                <p className="text-muted-foreground">Value: {formatNumber(link.value)}</p>
              </div>
            )}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {sanitizedLinks.map((link, index) => (
          <div key={`${link.source}-${link.target}-${index}`} className="rounded-lg border bg-background/70 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
              <span className="truncate">{link.source}</span>
              <span className="text-muted-foreground">to</span>
              <span className="truncate">{link.target}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{formatNumber(link.value)}</p>
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
  onToggle,
  depth = 0,
}: {
  nodes: AccountNode[]
  selectedAccountIds: Set<string>
  onToggle: (node: AccountNode, checked: boolean) => void
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

function collectAccountNodeIds(node: AccountNode): string[] {
  return [node.id, ...node.children.flatMap((child) => collectAccountNodeIds(child))]
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
