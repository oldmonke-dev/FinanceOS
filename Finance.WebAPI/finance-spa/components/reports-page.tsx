"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart3, PieChart, Waypoints } from "lucide-react"

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

type FlowLink = {
  source: string
  target: string
  value: number
}

export function ReportsPage() {
  const { accounts, isLoading: isLoadingAccounts, errorMessage: accountsError } = useAccounts()
  const { sessions, errorMessage: sessionsError } = useImportSessions()
  const { formatNumber } = useUserPreferences()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true)
  const [transactionsError, setTransactionsError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [accountQuery, setAccountQuery] = useState("")
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set())
  const [importSessionFilter, setImportSessionFilter] = useState<ImportSessionFilter>("all")

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

    setDateFrom((current) => current || transactionDateRange.earliest)
    setDateTo((current) => current || transactionDateRange.latest)
  }, [transactionDateRange.earliest, transactionDateRange.latest])

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.transactionDate)
      const transactionTime = transactionDate.getTime()

      if (dateFrom) {
        const fromTime = new Date(`${dateFrom}T00:00:00`).getTime()
        if (transactionTime < fromTime) {
          return false
        }
      }

      if (dateTo) {
        const toTime = new Date(`${dateTo}T23:59:59.999`).getTime()
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
  }, [dateFrom, dateTo, importSessionFilter, importSessionStatusByTransactionId, selectedAccountIds, transactions])

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
          <label className="min-w-[18rem] flex-1 space-y-1 text-xs">
            <span className="font-medium text-muted-foreground">Account search</span>
            <Input
              value={accountQuery}
              onChange={(event) => setAccountQuery(event.target.value)}
              placeholder="Search accounts"
              className="h-8"
            />
          </label>
        </div>

        <div className="mt-3 rounded-xl border bg-background/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Account scope</p>
              <p className="text-xs text-muted-foreground">
                {selectedAccountIds.size === 0
                  ? "Showing all accounts"
                  : `${selectedAccountIds.size} account${selectedAccountIds.size === 1 ? "" : "s"} selected`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAccountIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
          <div className="mt-3 max-h-48 overflow-y-auto pr-1">
            {filteredAccountTree.length === 0 ? (
              <p className="text-xs text-muted-foreground">No accounts match.</p>
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
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Monthly Trend</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Income and expense movement by month.
            </p>
            <div className="mt-4">
              <MonthlyBarChart items={monthlyTotals} formatNumber={formatNumber} />
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

function MonthlyBarChart({
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

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.month} className="grid gap-2 md:grid-cols-[6rem_1fr] md:items-center">
          <div className="text-sm font-medium">{item.month}</div>
          <div className="space-y-2">
            <BarRow label="Income" value={item.income} maxValue={maxValue} color="bg-emerald-500" formatNumber={formatNumber} />
            <BarRow label="Expense" value={item.expense} maxValue={maxValue} color="bg-rose-500" formatNumber={formatNumber} />
          </div>
        </div>
      ))}
    </div>
  )
}

function BarRow({
  label,
  value,
  maxValue,
  color,
  formatNumber,
}: {
  label: string
  value: number
  maxValue: number
  color: string
  formatNumber: (value: number, fractionDigits?: number) => string
}) {
  const width = `${(value / maxValue) * 100}%`

  return (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width }} />
      </div>
      <span className="font-medium">{formatNumber(value)}</span>
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
  if (links.length === 0) {
    return <EmptyChartState message="No source-to-destination flow available." />
  }

  const sources = [...new Set(links.map((link) => link.source))]
  const targets = [...new Set(links.map((link) => link.target))]
  const sourceY = new Map(sources.map((item, index) => [item, 40 + index * 48]))
  const targetY = new Map(targets.map((item, index) => [item, 40 + index * 48]))
  const maxValue = Math.max(...links.map((link) => link.value), 1)
  const height = Math.max(sources.length, targets.length) * 48 + 40

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 860 ${height}`} className="min-w-[52rem]">
        {links.map((link, index) => {
          const fromY = sourceY.get(link.source) ?? 40
          const toY = targetY.get(link.target) ?? 40
          const thickness = 8 + (link.value / maxValue) * 18

          return (
            <path
              key={`${link.source}-${link.target}-${index}`}
              d={`M 180 ${fromY} C 330 ${fromY}, 530 ${toY}, 680 ${toY}`}
              fill="none"
              stroke={chartColors[index % chartColors.length]}
              strokeOpacity="0.55"
              strokeWidth={thickness}
              strokeLinecap="round"
            />
          )
        })}

        {sources.map((source) => (
          <g key={source}>
            <rect x="20" y={(sourceY.get(source) ?? 40) - 12} width="150" height="24" rx="8" fill="#e2e8f0" />
            <text x="28" y={(sourceY.get(source) ?? 40) + 4} className="fill-zinc-700 text-[11px]">
              {truncateLabel(source)}
            </text>
          </g>
        ))}

        {targets.map((target) => (
          <g key={target}>
            <rect x="690" y={(targetY.get(target) ?? 40) - 12} width="150" height="24" rx="8" fill="#e2e8f0" />
            <text x="698" y={(targetY.get(target) ?? 40) + 4} className="fill-zinc-700 text-[11px]">
              {truncateLabel(target)}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {links.map((link, index) => (
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

function truncateLabel(value: string) {
  return value.length > 28 ? `${value.slice(0, 28)}...` : value
}
