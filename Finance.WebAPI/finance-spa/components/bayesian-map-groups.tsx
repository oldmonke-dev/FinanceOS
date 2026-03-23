"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Trash2 } from "lucide-react"

import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deleteBayesianLearningForAccount } from "@/lib/strategies"
import { type BayesianMapGroup } from "@/models/strategy"

export function BayesianMapGroups({ groups }: { groups: BayesianMapGroup[] }) {
  const router = useRouter()
  const { confirm, alert } = useConfirmationDialog()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25
  const filteredGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    if (!normalizedSearch) {
      return groups
    }

    return groups.filter((group) => {
      const haystack = `${group.destinationAccountName} ${group.destinationAccountPath}`.toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [groups, search])
  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize))
  const pagedGroups = useMemo(
    () => filteredGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredGroups],
  )

  function toggleGroup(groupId: string) {
    setExpandedIds((current) => {
      const next = new Set(current)

      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }

      return next
    })
  }

  async function handleDeleteLearning(group: BayesianMapGroup) {
    const confirmed = await confirm({
      title: "Delete Bayesian learning",
      message: `Delete Bayesian learning for "${group.destinationAccountPath}"? This removes all learned features for this destination account.`,
      confirmLabel: "Delete",
      variant: "destructive",
    })

    if (!confirmed) {
      return
    }

    setDeletingAccountId(group.destinationAccountId)

    try {
      await deleteBayesianLearningForAccount(group.destinationAccountId)
      router.refresh()
    } catch (error) {
      await alert({
        title: "Delete failed",
        message: error instanceof Error ? error.message : "Failed to delete account learning.",
      })
    } finally {
      setDeletingAccountId(null)
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-col gap-3 rounded-lg border bg-background/70 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Learned accounts</p>
          <p className="text-xs text-muted-foreground">
            {filteredGroups.length === 0
              ? "No accounts match the current search."
              : `Showing ${Math.min((currentPage - 1) * pageSize + 1, filteredGroups.length)}-${Math.min(
                  currentPage * pageSize,
                  filteredGroups.length,
                )} of ${filteredGroups.length} accounts`}
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search accounts"
            className="h-9 w-full lg:w-64"
          />
          <div className="inline-flex items-center gap-2 rounded-lg border bg-background px-2 py-1 text-xs text-muted-foreground">
            <span>{`Page ${currentPage} / ${totalPages}`}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpandedIds(new Set())}
            disabled={expandedIds.size === 0}
          >
            Collapse all
          </Button>
        </div>
      </div>
      {pagedGroups.map((group) => {
        const isExpanded = expandedIds.has(group.destinationAccountId)

        return (
          <article key={group.destinationAccountId} className="rounded-lg border bg-background/70">
            <button
              type="button"
              onClick={() => toggleGroup(group.destinationAccountId)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-muted/40"
            >
              <div className="flex min-w-0 items-center gap-2">
                <ChevronRight
                  className={`size-4 shrink-0 text-muted-foreground transition ${isExpanded ? "rotate-90" : ""}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{group.destinationAccountName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {group.destinationAccountPath}
                  </p>
                </div>
              </div>
              <div className="shrink-0 rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                {group.totalLearnedCount}
              </div>
            </button>

            {isExpanded ? (
              <div className="border-t px-3 py-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-muted-foreground">
                    Clear learned Bayesian mappings for this destination account.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDeleteLearning(group)}
                    disabled={deletingAccountId === group.destinationAccountId}
                  >
                    <Trash2 className="size-3.5" />
                    {deletingAccountId === group.destinationAccountId
                      ? "Deleting..."
                      : "Delete learning"}
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[28rem] border-collapse text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="border-b px-2.5 py-1.5 text-left font-medium">Feature key</th>
                        <th className="border-b px-2.5 py-1.5 text-right font-medium">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((entry, index) => (
                        <tr
                          key={`${group.destinationAccountId}-${entry.featureKey}`}
                          className={index % 2 === 0 ? "bg-card/60" : "bg-card"}
                        >
                          <td className="border-t px-2.5 py-1 font-mono text-[11px] leading-snug">
                            {entry.featureKey}
                          </td>
                          <td className="border-t px-2.5 py-1 text-right tabular-nums">
                            {entry.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
