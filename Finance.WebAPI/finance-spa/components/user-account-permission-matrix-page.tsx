"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Check, X } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { buildAccountPathLookup, formatAccountReportingMode, getAccountOwnerLabel } from "@/lib/accounts"
import { getBayesianStrategy } from "@/lib/strategies"

export function UserAccountPermissionMatrixPage() {
  const { accounts, isLoading, errorMessage } = useAccounts()
  const [learningAccountIds, setLearningAccountIds] = useState<Set<string>>(new Set())
  const accountPathLookup = buildAccountPathLookup(accounts)
  const visibleAccounts = [...accounts].sort((left, right) =>
    (accountPathLookup.get(left.id) ?? left.name).localeCompare(accountPathLookup.get(right.id) ?? right.name),
  )
  const badgeText = `${visibleAccounts.length} accounts`

  useEffect(() => {
    let isCancelled = false

    async function loadLearning() {
      try {
        const strategy = await getBayesianStrategy()
        if (isCancelled) {
          return
        }

        setLearningAccountIds(
          new Set(
            strategy.mapGroups
              .filter((group) => group.totalLearnedCount > 0)
              .map((group) => group.destinationAccountId),
          ),
        )
      } catch {
        if (!isCancelled) {
          setLearningAccountIds(new Set())
        }
      }
    }

    void loadLearning()

    return () => {
      isCancelled = true
    }
  }, [])

  return (
    <AppShell
      title="Permission Matrix"
      subtitle="Current effective access for your account list"
      badge={badgeText}
    >
      <section className="mx-auto w-full rounded-3xl border bg-card p-5 shadow-sm xl:w-[60%]">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Current Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Review what you can view, post, edit, delete, or manage across the current account set.
          </p>
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading account permissions...</p>
        ) : errorMessage ? (
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto" data-horizontal-scroll-region>
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-2.5 py-2 text-left font-medium">Account</th>
                  <th className="px-2.5 py-2 text-left font-medium">Owner</th>
                  <th className="px-2.5 py-2 text-left font-medium">Reporting</th>
                  <th className="px-1.5 py-2 text-center font-medium">Shared</th>
                  <th className="px-1.5 py-2 text-center font-medium">View</th>
                  <th className="px-1.5 py-2 text-center font-medium">Post</th>
                  <th className="px-1.5 py-2 text-center font-medium">Edit</th>
                  <th className="px-1.5 py-2 text-center font-medium">Delete</th>
                  <th className="px-1.5 py-2 text-center font-medium">Manage</th>
                  <th className="px-1.5 py-2 text-center font-medium">Owner</th>
                  <th className="px-1.5 py-2 text-center font-medium">Learning</th>
                  <th className="px-2.5 py-2 text-right font-medium">Open</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map((account) => (
                  <tr key={account.id} className="border-t">
                    <td className="px-2.5 py-2 align-top">
                      <div className="font-medium">{account.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {accountPathLookup.get(account.id) ?? account.name}
                      </div>
                    </td>
                    <td className="px-2.5 py-2 align-top text-muted-foreground">
                      {getAccountOwnerLabel(account)}
                    </td>
                    <td className="px-2.5 py-2 align-top text-muted-foreground">
                      {formatAccountReportingMode(account.reportingMode)}
                    </td>
                    <PermissionCell allowed={account.isGloballyShared} />
                    <PermissionCell allowed={account.currentUserPermissions.canView} />
                    <PermissionCell allowed={account.currentUserPermissions.canPost} />
                    <PermissionCell allowed={account.currentUserPermissions.canEditTransaction} />
                    <PermissionCell allowed={account.currentUserPermissions.canDeleteTransaction} />
                    <PermissionCell allowed={account.currentUserPermissions.canManageAccess} />
                    <PermissionCell allowed={account.currentUserPermissions.isOwner} />
                    <PermissionCell allowed={learningAccountIds.has(account.id)} />
                    <td className="px-2.5 py-2 text-right">
                      <Link
                        href={
                          account.currentUserPermissions.canManageAccess
                            ? `/accounts/${account.id}/permissions`
                            : `/accounts/${account.id}`
                        }
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                {visibleAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-2.5 py-4 text-sm text-muted-foreground">
                      No accounts available yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  )
}

function PermissionCell({ allowed }: { allowed: boolean }) {
  return (
    <td className="px-1.5 py-2 text-center">
      <span
        className={`inline-flex size-5 items-center justify-center rounded-full ${
          allowed ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"
        }`}
      >
        {allowed ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      </span>
    </td>
  )
}
