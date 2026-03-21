"use client"

import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"

import { type BayesianMapGroup } from "@/models/strategy"

export function BayesianMapGroups({ groups }: { groups: BayesianMapGroup[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const compactGroups = useMemo(() => groups.slice(0, 200), [groups])

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

  return (
    <div className="mt-4 space-y-2">
      {compactGroups.map((group) => {
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

      {groups.length > compactGroups.length ? (
        <div className="rounded-lg border border-dashed bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          Showing first {compactGroups.length} accounts.
        </div>
      ) : null}
    </div>
  )
}
