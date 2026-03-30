"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Info, Plus, Trash2, X } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { useSnackbar } from "@/components/providers/snackbar-provider"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  formatAccountReportingMode,
  getAccountPermissions,
  updateAccountPermissions,
} from "@/lib/accounts"
import type {
  AccountAccessEntry,
  AccountPermissionUserOption,
  AccountPermissionsDetails,
  AccountReportingMode,
} from "@/models/account"

const reportingModeOptions: AccountReportingMode[] = ["Included", "OperationalOnly", "Excluded"]

export function AccountPermissionsPage({ accountId }: { accountId: string }) {
  const { refreshAccounts } = useAccounts()
  const { showSnackbar } = useSnackbar()
  const [details, setDetails] = useState<AccountPermissionsDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState("")

  useEffect(() => {
    let isCancelled = false

    async function load() {
      setIsLoading(true)

      try {
        const nextDetails = await getAccountPermissions(accountId)
        if (!isCancelled) {
          setDetails(nextDetails)
          setErrorMessage(null)
        }
      } catch (error) {
        if (!isCancelled) {
          setDetails(null)
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load account permissions.",
          )
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      isCancelled = true
    }
  }, [accountId])

  const availableUserOptions = useMemo(() => {
    if (!details) {
      return []
    }

    const assignedUserIds = new Set(details.entries.map((entry) => entry.userId))
    return details.availableUsers.filter((user) => !assignedUserIds.has(user.id))
  }, [details])

  function updateEntry(
    userId: string,
    updater: (entry: AccountAccessEntry) => AccountAccessEntry,
  ) {
    setDetails((current) =>
      current == null
        ? current
        : {
            ...current,
            entries: current.entries.map((entry) =>
              entry.userId === userId ? updater(entry) : entry,
            ),
          },
    )
  }

  function updateEntryFlag(userId: string, key: keyof Pick<AccountAccessEntry, "canView" | "canPost" | "canEditTransaction" | "canDeleteTransaction" | "canManageAccess">, checked: boolean) {
    updateEntry(userId, (entry) => {
      const nextEntry = { ...entry, [key]: checked }
      const hasElevatedAccess =
        nextEntry.canPost ||
        nextEntry.canEditTransaction ||
        nextEntry.canDeleteTransaction ||
        nextEntry.canManageAccess

      return {
        ...nextEntry,
        canView: nextEntry.canView || hasElevatedAccess,
      }
    })
  }

  function removeEntry(userId: string) {
    setDetails((current) =>
      current == null
        ? current
        : {
            ...current,
            entries: current.entries.filter((entry) => entry.userId !== userId),
          },
    )
  }

  function addEntry(user: AccountPermissionUserOption) {
    setDetails((current) =>
      current == null
        ? current
        : {
            ...current,
            entries: [
              ...current.entries,
              {
                userId: user.id,
                userDisplayName: user.displayName,
                userEmail: user.email,
                isAdmin: user.isAdmin,
                canView: true,
                canPost: false,
                canEditTransaction: false,
                canDeleteTransaction: false,
                canManageAccess: false,
              },
            ].sort((left, right) =>
              `${left.userDisplayName}${left.userEmail}`.localeCompare(
                `${right.userDisplayName}${right.userEmail}`,
              ),
            ),
          },
    )
    setSelectedUserId("")
  }

  async function handleSave() {
    if (!details) {
      return
    }

    setIsSaving(true)

    try {
        const nextDetails = await updateAccountPermissions(accountId, {
          ownerUserId: details.ownerUserId,
          isGloballyShared: details.isGloballyShared,
          reportingMode: details.reportingMode,
          entries: details.entries,
        })

      setDetails(nextDetails)
      await refreshAccounts()
      showSnackbar({ message: "Account permissions saved.", tone: "success" })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to save account permissions.",
        tone: "error",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AppShell
      title="Account Permissions"
      subtitle="Manage reporting mode, ownership, and per-user access"
      badge={details ? details.accountName : "Loading"}
    >
      <div className="space-y-4">
        <Button asChild type="button" variant="outline">
          <Link href="/accounts">
            <ArrowLeft />
            Back to account tree
          </Link>
        </Button>

        {isLoading ? (
          <div className="rounded-3xl border bg-card p-8 text-sm text-muted-foreground">
            Loading account permissions...
          </div>
        ) : errorMessage ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : details ? (
          <>
            <section className="rounded-3xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-4">
                <label className="flex self-center flex-col gap-2 text-sm">
                  <span className="inline-flex min-h-5 items-center gap-1.5 font-medium">
                    <span>Reporting mode</span>
                    <InfoTooltip content="Controls whether this account participates in financial reports. Included appears in reports, Operational only stays usable in ledgers but is excluded from report totals, and Excluded is hidden from reporting entirely." />
                  </span>
                  <Select
                    value={details.reportingMode}
                    onValueChange={(value) =>
                      setDetails((current) =>
                        current == null
                          ? current
                          : {
                              ...current,
                              reportingMode: value as AccountReportingMode,
                            },
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {reportingModeOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {formatAccountReportingMode(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="flex self-center flex-col gap-2 text-sm">
                  <span className="inline-flex min-h-5 items-center font-medium">Primary owner</span>
                  <Select
                    value={details.ownerUserId ?? "__none__"}
                    onValueChange={(value) =>
                      setDetails((current) =>
                        current == null
                          ? current
                          : {
                              ...current,
                              ownerUserId: value === "__none__" ? null : value,
                            },
                      )
                    }
                    disabled={!details.currentUserPermissions.canChangeOwner}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No owner</SelectItem>
                      {details.availableUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.displayName} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <div className="flex self-center flex-col gap-2 text-sm">
                  <span className="inline-flex min-h-5 items-center gap-1.5 font-medium">
                    <span>Globally shared</span>
                    <InfoTooltip content="When enabled, every non-admin user can view, post, edit, and delete transactions on this account. Manage access still stays with admins and the owner." />
                  </span>
                  <label className="flex min-h-10 items-center gap-3 rounded-md border px-3">
                    <Checkbox
                      checked={details.isGloballyShared}
                      onCheckedChange={(checked) =>
                        setDetails((current) =>
                          current == null
                            ? current
                            : {
                                ...current,
                                isGloballyShared: Boolean(checked),
                              },
                        )
                      }
                    />
                    <span className="text-sm text-muted-foreground">
                      Allow all users to use this account
                    </span>
                  </label>
                </div>

                <div className="rounded-2xl border bg-background/70 p-4 text-sm">
                  <p className="font-medium">Your effective access</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-muted-foreground">
                    <AccessStatus
                      label="View"
                      allowed={details.currentUserPermissions.canView}
                    />
                    <AccessStatus
                      label="Post"
                      allowed={details.currentUserPermissions.canPost}
                    />
                    <AccessStatus
                      label="Manage"
                      allowed={details.currentUserPermissions.canManageAccess}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[18rem] flex-1 space-y-2 text-sm">
                  <span className="font-medium">Add user</span>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUserOptions.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.displayName} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedUserId}
                  onClick={() => {
                    const user = availableUserOptions.find((item) => item.id === selectedUserId)
                    if (user) {
                      addEntry(user)
                    }
                  }}
                >
                  <Plus />
                  Add access
                </Button>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2.5 py-2 text-left font-medium">User</th>
                      <th className="w-14 px-2 py-2 text-center font-medium">View</th>
                      <th className="w-14 px-2 py-2 text-center font-medium">Post</th>
                      <th className="w-14 px-2 py-2 text-center font-medium">Edit</th>
                      <th className="w-16 px-2 py-2 text-center font-medium">Delete</th>
                      <th className="w-16 px-2 py-2 text-center font-medium">
                        <span className="inline-flex items-center justify-center gap-1">
                          <span>Manage</span>
                          <InfoTooltip content="Manage means this user can open the permissions screen and change who else has access to this account. It does not by itself transfer ownership." />
                        </span>
                      </th>
                      <th className="w-24 px-2.5 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.entries.map((entry) => (
                      <tr key={entry.userId} className="border-t">
                        <td className="px-2.5 py-2.5 align-top">
                          <div className="font-medium">{entry.userDisplayName}</div>
                          <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                            {entry.userEmail}
                          </div>
                          {entry.isAdmin ? (
                            <div className="mt-1">
                              <span className="inline-flex rounded-full border bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                Admin
                              </span>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Checkbox
                            checked={entry.canView}
                            onCheckedChange={(checked) =>
                              updateEntryFlag(entry.userId, "canView", Boolean(checked))
                            }
                          />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Checkbox
                            checked={entry.canPost}
                            onCheckedChange={(checked) =>
                              updateEntryFlag(entry.userId, "canPost", Boolean(checked))
                            }
                          />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Checkbox
                            checked={entry.canEditTransaction}
                            onCheckedChange={(checked) =>
                              updateEntryFlag(entry.userId, "canEditTransaction", Boolean(checked))
                            }
                          />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Checkbox
                            checked={entry.canDeleteTransaction}
                            onCheckedChange={(checked) =>
                              updateEntryFlag(entry.userId, "canDeleteTransaction", Boolean(checked))
                            }
                          />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Checkbox
                            checked={entry.canManageAccess}
                            onCheckedChange={(checked) =>
                              updateEntryFlag(entry.userId, "canManageAccess", Boolean(checked))
                            }
                          />
                        </td>
                        <td className="px-2.5 py-2.5 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs"
                            onClick={() => removeEntry(entry.userId)}
                          >
                            <Trash2 />
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {details.entries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-sm text-muted-foreground">
                          No explicit access rows yet. Use the globally shared toggle if this account should be open to every user.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="flex justify-end">
              <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save permissions"}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  )
}

function InfoTooltip({ content }: { content: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
            aria-label="More information"
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 text-center text-xs leading-relaxed">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function AccessStatus({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {allowed ? (
        <Check className="size-3.5 text-emerald-600" />
      ) : (
        <X className="size-3.5 text-rose-600" />
      )}
      <span>{label}</span>
    </span>
  )
}
