"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Briefcase,
  ChevronRight,
  CircleDashed,
  Download,
  EllipsisVertical,
  FileSpreadsheet,
  FolderPlus,
  FolderTree,
  Landmark,
  ListTree,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react"

import { useAccounts } from "@/components/providers/accounts-provider"
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider"
import { useImportSessions } from "@/components/providers/import-sessions-provider"
import { useSnackbar } from "@/components/providers/snackbar-provider"
import { useAuth } from "@/components/providers/auth-provider"
import { useUserPreferences } from "@/components/providers/user-preferences-provider"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import { getBalanceDeltaForAccount, getDisplayBalanceForAccount } from "@/lib/accounting"
import {
  batchUpdateAccounts,
  buildAccountTree,
  createAccount,
  deleteAccount,
  formatAccountType,
  getAccountOwnerLabel,
  renameAccount,
  updateAccountPermissions,
  updateAccountOwner,
} from "@/lib/accounts"
import { getTransactions } from "@/lib/transactions"
import { getUsers } from "@/lib/users"
import {
  type Account,
  type BatchUpdateAccountResult,
  type AccountNode,
  type AccountReportingMode,
  type AccountType,
  type CreateAccountInput,
} from "@/models/account"
import { type User } from "@/models/user"

type AccountFormProps = {
  parentAccountId: string | null
  parentLabel: string
  parentAccountType?: AccountType | null
  onCancel: () => void
  onCreated: (account: Account) => void
}

type RenameAccountFormProps = {
  account: Account
  users: User[]
  isAdmin: boolean
  isLoadingUsers: boolean
  onCancel: () => void
  onRenamed: (account: Account) => void
}

type MoveAccountFormProps = {
  account: Account
  availableParents: Account[]
  isAdmin: boolean
  onRefreshRequested: () => Promise<void>
  onCancel: () => void
  onMoved: () => Promise<void> | void
}

type OpeningBalanceFormProps = {
  account: Account
  onCancel: () => void
  onSaved: (account: Account) => void
}

type BatchAccountUpdateFormProps = {
  accounts: Account[]
  selectedAccountIds: string[]
  users: User[]
  isAdmin: boolean
  isLoadingUsers: boolean
  onSelectionChange: (accountIds: string[]) => void
  onCancel: () => void
  onApplied: (selectedAccounts: Account[], results: BatchUpdateAccountResult[]) => Promise<void>
}

type ImportedAccountDraft = {
  id: string
  fullPath: string
  accountType: AccountType
  sourceAccountId?: string | null
  ownerUserId?: string | null
  accountNumber?: string | null
  description?: string | null
  openingBalance?: number
  reportingMode?: AccountReportingMode
  isGloballyShared?: boolean
  include: boolean
  isExisting: boolean
}

type ExportedAccountHierarchyNode = {
  id: string
  name: string
  accountType: AccountType
  ownerUserId: string | null
  accountNumber: string | null
  description: string | null
  openingBalance: number
  reportingMode: AccountReportingMode
  isGloballyShared: boolean
  children: ExportedAccountHierarchyNode[]
}

type ExportedAccountHierarchy = {
  format: "finance.account_hierarchy"
  version: 1
  exportedAt: string
  tree: ExportedAccountHierarchyNode[]
}

type ImportedAccountNode = {
  id: string
  name: string
  fullPath: string
  accountType: AccountType
  children: ImportedAccountNode[]
}

const accountTypeOptions: { value: AccountType; label: string }[] = [
  { value: 1, label: "Asset" },
  { value: 2, label: "Liability" },
  { value: 3, label: "Equity" },
  { value: 4, label: "Income" },
  { value: 5, label: "Expense" },
]

const ACCOUNT_TREE_COLLAPSED_STATE_KEY = "finance.account-tree.collapsed"
const ACCOUNT_TREE_RESTORE_PENDING_KEY = "finance.account-tree.restore-pending"

export function AccountTree() {
  const router = useRouter()
  const { user } = useAuth()
  const { accounts, addAccount, updateAccount, errorMessage, isLoading, refreshAccounts } =
    useAccounts()
  const { confirm } = useConfirmationDialog()
  const { showSnackbar } = useSnackbar()
  const { refreshSessions } = useImportSessions()
  const { formatNumber } = useUserPreferences()
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const hasInitializedCollapsedIdsRef = useRef(false)
  const [activeParentId, setActiveParentId] = useState<string | "root" | null>(null)
  const [renamingAccountId, setRenamingAccountId] = useState<string | null>(null)
  const [movingAccountId, setMovingAccountId] = useState<string | null>(null)
  const [editingOpeningBalanceAccountId, setEditingOpeningBalanceAccountId] = useState<string | null>(null)
  const [openActionsAccountId, setOpenActionsAccountId] = useState<string | null>(null)
  const [isMultiSelectEnabled, setIsMultiSelectEnabled] = useState(false)
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  const [balanceLookup, setBalanceLookup] = useState<Record<string, number>>({})
  const [directTransactionAccountIds, setDirectTransactionAccountIds] = useState<Set<string>>(new Set())
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)

  const nodes = buildAccountTree(accounts)
  const accountTypeById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.accountType])),
    [accounts],
  )
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const searchResult = useMemo(
    () => filterAccountTree(nodes, normalizedSearchTerm),
    [nodes, normalizedSearchTerm],
  )
  const visibleNodes = normalizedSearchTerm ? searchResult.nodes : nodes
  const rolledUpBalanceLookup = useMemo(() => {
    const nextLookup = { ...balanceLookup }

    function visit(node: AccountNode): number {
      const ownBalance = (balanceLookup[node.id] ?? 0) + node.openingBalance
      const childBalance = node.children.reduce((sum, child) => sum + visit(child), 0)
      const total = ownBalance + childBalance
      nextLookup[node.id] = total
      return total
    }

    nodes.forEach((node) => {
      visit(node)
    })

    return nextLookup
  }, [nodes, balanceLookup])

  useEffect(() => {
    if (nodes.length === 0 || hasInitializedCollapsedIdsRef.current) {
      return
    }

    const defaultCollapsedIds = new Set(collectBranchAccountIds(nodes))

    if (typeof window === "undefined") {
      setCollapsedIds(defaultCollapsedIds)
      hasInitializedCollapsedIdsRef.current = true
      return
    }

    const shouldRestore = window.sessionStorage.getItem(ACCOUNT_TREE_RESTORE_PENDING_KEY) === "1"
    const savedCollapsedIds = window.sessionStorage.getItem(ACCOUNT_TREE_COLLAPSED_STATE_KEY)

    if (shouldRestore && savedCollapsedIds) {
      try {
        const parsedIds = JSON.parse(savedCollapsedIds)
        if (Array.isArray(parsedIds)) {
          setCollapsedIds(new Set(parsedIds.filter((value): value is string => typeof value === "string")))
        } else {
          setCollapsedIds(defaultCollapsedIds)
        }
      } catch {
        setCollapsedIds(defaultCollapsedIds)
      }
    } else {
      setCollapsedIds(defaultCollapsedIds)
    }

    window.sessionStorage.removeItem(ACCOUNT_TREE_RESTORE_PENDING_KEY)
    hasInitializedCollapsedIdsRef.current = true
  }, [nodes])

  useEffect(() => {
    if (!hasInitializedCollapsedIdsRef.current || typeof window === "undefined") {
      return
    }

    window.sessionStorage.setItem(ACCOUNT_TREE_COLLAPSED_STATE_KEY, JSON.stringify([...collapsedIds]))
  }, [collapsedIds])

  useEffect(() => {
    let isCancelled = false

    async function loadBalances() {
      try {
        const transactions = await getTransactions()

        if (isCancelled) {
          return
        }

        const nextLookup: Record<string, number> = {}
        const nextDirectTransactionAccountIds = new Set<string>()

        for (const transaction of transactions) {
          for (const split of transaction.splits) {
            nextDirectTransactionAccountIds.add(split.accountId)
            nextLookup[split.accountId] =
              (nextLookup[split.accountId] ?? 0) +
              getBalanceDeltaForAccount(accountTypeById.get(split.accountId), split)
          }
        }

        setBalanceLookup(nextLookup)
        setDirectTransactionAccountIds(nextDirectTransactionAccountIds)
        setBalanceError(null)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setBalanceLookup({})
        setDirectTransactionAccountIds(new Set())
        setBalanceError(
          error instanceof Error ? error.message : "Failed to load account balances.",
        )
      }
    }

    void loadBalances()

    return () => {
      isCancelled = true
    }
  }, [accountTypeById])

  useEffect(() => {
    if (!user?.isAdmin) {
      setUsers([])
      return
    }

    let isCancelled = false

    async function loadUsers() {
      setIsLoadingUsers(true)

      try {
        const nextUsers = await getUsers()
        if (!isCancelled) {
          setUsers(nextUsers.filter((item) => item.isActive))
        }
      } catch (error) {
        if (!isCancelled) {
          showSnackbar({
            message: error instanceof Error ? error.message : "Failed to load users.",
            tone: "error",
          })
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingUsers(false)
        }
      }
    }

    void loadUsers()

    return () => {
      isCancelled = true
    }
  }, [showSnackbar, user?.isAdmin])

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
        Loading accounts...
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold">Could not load accounts</h2>
        <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
        <div className="mt-4">
          <Button type="button" variant="outline" onClick={() => void refreshAccounts()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-muted-foreground">
        No accounts were returned by the backend.
      </div>
    )
  }

  function toggleCollapsed(accountId: string) {
    setCollapsedIds((current) => {
      const next = new Set(current)

      if (next.has(accountId)) {
        next.delete(accountId)
      } else {
        next.add(accountId)
      }

      return next
    })
  }

  function collapseAll() {
    setCollapsedIds(new Set(collectBranchAccountIds(nodes)))
  }

  function expandAll() {
    setCollapsedIds(new Set())
  }

  function handleCreated(account: Account) {
    addAccount(account)
    setActiveParentId(null)
    setRenamingAccountId(null)
    setMovingAccountId(null)
    setEditingOpeningBalanceAccountId(null)
    setOpenActionsAccountId(null)
    showSnackbar({ message: `Created account ${account.name}.`, tone: "success" })
  }

  function toggleAccountSelection(accountId: string, checked: boolean) {
    if (!isMultiSelectEnabled) {
      return
    }

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

  function handleRenamed(account: Account) {
    updateAccount(account)
    setRenamingAccountId(null)
    setMovingAccountId(null)
    setEditingOpeningBalanceAccountId(null)
    setOpenActionsAccountId(null)
    showSnackbar({ message: `Updated account ${account.name}.`, tone: "success" })
  }

  function handleOpeningBalanceSaved(account: Account) {
    updateAccount(account)
    setEditingOpeningBalanceAccountId(null)
    setRenamingAccountId(null)
    setMovingAccountId(null)
    setOpenActionsAccountId(null)
    showSnackbar({ message: `Updated opening balance for ${account.name}.`, tone: "success" })
  }

  async function handleBatchApplied(selectedAccounts: Account[], results: BatchUpdateAccountResult[]) {
    await refreshAccounts()
    setSelectedAccountIds(new Set())
    setOpenActionsAccountId(null)
    setMovingAccountId(null)

    const changedTypeCount = results.filter((item) => item.accountTypeChanged).length
    const messageParts = [`Updated ${selectedAccounts.length} account${selectedAccounts.length === 1 ? "" : "s"}.`]

    if (changedTypeCount > 0) {
      messageParts.push(
        `${changedTypeCount} moved account${changedTypeCount === 1 ? "" : "s"} also changed type to match the destination branch.`,
      )
    }

    showSnackbar({ message: messageParts.join(" "), tone: "success" })
  }

  async function handleDeleteAccount(account: Account) {
    const confirmed = await confirm({
      title: "Delete account",
      message: `Delete ${account.name}? Any transactions tagged to this account will be moved into a mandatory review session for remapping.`,
      confirmLabel: "Delete",
      variant: "destructive",
    })

    if (!confirmed) {
      return
    }

    setDeletingAccountId(account.id)
    setOpenActionsAccountId(null)

    try {
      const result = await deleteAccount(account.id)
      await Promise.all([refreshAccounts(), refreshSessions()])
      showSnackbar({ message: `Deleted account ${account.name}.`, tone: "success" })

      if (result.createdImportSessionId) {
        router.push("/import-sessions")
      }
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to delete account.",
        tone: "error",
      })
    } finally {
      setDeletingAccountId(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-2 border-b pb-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/8 p-2 text-primary">
            <FolderTree className="size-4.5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Account hierarchy</h2>
            <p className="text-xs text-muted-foreground">
              Expand nodes and add accounts inline.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search accounts"
            className="h-8 w-full min-w-52 md:w-56"
          />
          <Button type="button" size="sm" variant="outline" onClick={collapseAll}>
            Collapse All
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={expandAll}>
            Expand All
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isMultiSelectEnabled ? "secondary" : "outline"}
            onClick={() => {
              setIsMultiSelectEnabled((current) => {
                const next = !current
                if (!next) {
                  setSelectedAccountIds(new Set())
                }

                return next
              })
            }}
          >
            {isMultiSelectEnabled ? "Disable multi-select" : "Enable multi-select"}
          </Button>
          {user?.isAdmin ? (
            <Button
              type="button"
              size="sm"
              variant={activeParentId === "root" ? "secondary" : "outline"}
              onClick={() => setActiveParentId((current) => (current === "root" ? null : "root"))}
            >
              <Plus />
              New account
            </Button>
          ) : null}
          <Button type="button" size="sm" variant={isImportOpen ? "secondary" : "outline"} onClick={() => setIsImportOpen(true)}>
            <Upload />
            Import hierarchy
          </Button>
        </div>
      </div>

      {isMultiSelectEnabled && selectedAccountIds.size > 0 ? (
        <div className="mt-3">
          <BatchAccountUpdateForm
            accounts={accounts}
            selectedAccountIds={[...selectedAccountIds]}
            users={users}
            isAdmin={Boolean(user?.isAdmin)}
            isLoadingUsers={isLoadingUsers}
            onSelectionChange={(accountIds) => setSelectedAccountIds(new Set(accountIds))}
            onCancel={() => setSelectedAccountIds(new Set())}
            onApplied={handleBatchApplied}
          />
        </div>
      ) : null}

      {activeParentId === "root" ? (
        <div className="mt-3">
          <AccountForm
            parentAccountId={null}
            parentLabel="top level"
            parentAccountType={null}
            onCancel={() => setActiveParentId(null)}
            onCreated={handleCreated}
          />
        </div>
      ) : null}

      <Sheet open={isImportOpen} onOpenChange={setIsImportOpen}>
        <SheetContent
          side="top"
          className="inset-x-0 top-[4vh] bottom-[4vh] mx-auto h-auto w-[min(96vw,86rem)] max-w-none overflow-hidden rounded-2xl border p-0 sm:max-w-none"
        >
          <SheetHeader className="border-b bg-card px-6 py-5">
            <SheetTitle>Import Account Hierarchy</SheetTitle>
            <SheetDescription>
              Load a GnuCash-style account CSV, review the hierarchy first, edit it, then confirm the import.
            </SheetDescription>
          </SheetHeader>
          <div className="h-[calc(92vh-5.5rem)] overflow-y-auto px-6 pb-5 pt-6">
            <AccountHierarchyImportPanel
              accounts={accounts}
              addAccount={addAccount}
              refreshAccounts={refreshAccounts}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="mx-auto mt-3 w-full max-w-6xl">
        {balanceError ? (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {balanceError}
          </div>
        ) : null}
        {normalizedSearchTerm && visibleNodes.length === 0 ? (
          <div className="mb-4 rounded-2xl border border-dashed bg-background/70 p-4 text-sm text-muted-foreground">
            No accounts matched &quot;{searchTerm.trim()}&quot;.
          </div>
        ) : null}
        <TreeList
          nodes={visibleNodes}
          allAccounts={accounts}
          isAdmin={Boolean(user?.isAdmin)}
          isMultiSelectEnabled={isMultiSelectEnabled}
          depth={0}
          formatNumber={formatNumber}
          balanceLookup={rolledUpBalanceLookup}
          directTransactionAccountIds={directTransactionAccountIds}
          selectedAccountIds={selectedAccountIds}
          collapsedIds={collapsedIds}
          forcedExpandedIds={searchResult.forcedExpandedIds}
          activeParentId={activeParentId}
          onToggleSelected={toggleAccountSelection}
          onToggleCollapsed={toggleCollapsed}
          onOpenLedger={(accountId) => {
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem(ACCOUNT_TREE_COLLAPSED_STATE_KEY, JSON.stringify([...collapsedIds]))
            }
            router.push(`/accounts/${accountId}`)
          }}
          onOpenPermissions={(accountId) => {
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem(ACCOUNT_TREE_COLLAPSED_STATE_KEY, JSON.stringify([...collapsedIds]))
            }
            router.push(`/accounts/${accountId}/permissions`)
          }}
          onActivateCreate={(parentId) => {
            setRenamingAccountId(null)
            setMovingAccountId(null)
            setEditingOpeningBalanceAccountId(null)
            setOpenActionsAccountId(null)
            setActiveParentId(parentId)
          }}
          renamingAccountId={renamingAccountId}
          movingAccountId={movingAccountId}
          editingOpeningBalanceAccountId={editingOpeningBalanceAccountId}
          openActionsAccountId={openActionsAccountId}
          users={users}
          isLoadingUsers={isLoadingUsers}
          onToggleActionsMenu={(accountId) =>
            setOpenActionsAccountId((current) => (current === accountId ? null : accountId))
          }
          onCloseActionsMenu={() => setOpenActionsAccountId(null)}
          onActivateRename={(accountId) => {
            setActiveParentId(null)
            setMovingAccountId(null)
            setEditingOpeningBalanceAccountId(null)
            setOpenActionsAccountId(null)
            setRenamingAccountId(accountId)
          }}
          onActivateMove={(accountId) => {
            setActiveParentId(null)
            setRenamingAccountId(null)
            setEditingOpeningBalanceAccountId(null)
            setOpenActionsAccountId(null)
            setMovingAccountId(accountId)
          }}
          onActivateOpeningBalanceEdit={(accountId) => {
            setActiveParentId(null)
            setRenamingAccountId(null)
            setMovingAccountId(null)
            setOpenActionsAccountId(null)
            setEditingOpeningBalanceAccountId(accountId)
          }}
          deletingAccountId={deletingAccountId}
          onDeleteAccount={(account) => void handleDeleteAccount(account)}
          onCreated={handleCreated}
          onRenamed={handleRenamed}
          onOpeningBalanceSaved={handleOpeningBalanceSaved}
          onRefreshAccounts={refreshAccounts}
          onCancelCreate={() => setActiveParentId(null)}
          onCancelRename={() => setRenamingAccountId(null)}
          onCancelMove={() => setMovingAccountId(null)}
          onCancelOpeningBalanceEdit={() => setEditingOpeningBalanceAccountId(null)}
        />
      </div>
    </div>
  )
}

type AccountHierarchyImportPanelProps = {
  accounts: Account[]
  addAccount: (account: Account) => void
  refreshAccounts: () => Promise<void>
}

function AccountHierarchyImportPanel({
  accounts,
  addAccount,
  refreshAccounts,
}: AccountHierarchyImportPanelProps) {
  const { showSnackbar } = useSnackbar()
  const [drafts, setDrafts] = useState<ImportedAccountDraft[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const { confirm } = useConfirmationDialog()

  const existingAccountPathLookup = useMemo(() => buildExistingAccountPathLookup(accounts), [accounts])
  const normalizedDrafts = useMemo(
    () =>
      drafts.map((draft) => ({
        ...draft,
        fullPath: normalizeImportedFullPath(draft.fullPath),
        isExisting: existingAccountPathLookup.has(normalizeImportedFullPath(draft.fullPath).toLowerCase()),
      })),
    [drafts, existingAccountPathLookup],
  )
  const previewNodes = useMemo(
    () => buildImportedAccountTree(normalizedDrafts.filter((draft) => draft.include)),
    [normalizedDrafts],
  )
  const includedDraftCount = normalizedDrafts.filter((draft) => draft.include).length

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const text = await file.text()

    try {
      const nextDrafts =
        file.name.toLowerCase().endsWith(".json")
          ? parseExportedAccountHierarchy(text, existingAccountPathLookup)
          : parseGnuCashAccountCsv(text, existingAccountPathLookup)
      setDrafts(nextDrafts)
      setFileName(file.name)
      showSnackbar({ message: `Parsed account hierarchy from ${file.name}.`, tone: "success" })
    } catch (error) {
      setDrafts([])
      setFileName(file.name)
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to parse account hierarchy.",
        tone: "error",
      })
    }
  }

  function handleExport() {
    downloadJsonFile(
      `account-hierarchy-${new Date().toISOString().slice(0, 10)}.json`,
      buildAccountHierarchyExport(accounts),
    )
    showSnackbar({ message: "Exported account hierarchy JSON.", tone: "success" })
  }

  function updateDraft(draftId: string, updater: (draft: ImportedAccountDraft) => ImportedAccountDraft) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === draftId ? updater(draft) : draft)),
    )
  }

  function removeDraft(draftId: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== draftId))
  }

  async function handleImport() {
    const draftsToImport = normalizedDrafts.filter((draft) => draft.include)
    if (draftsToImport.length === 0) {
      return
    }

    const confirmed = await confirm({
      title: "Import account hierarchy",
      message: `Import ${draftsToImport.length} account path${draftsToImport.length === 1 ? "" : "s"}? Existing paths will be skipped.`,
      confirmLabel: "Import",
    })

    if (!confirmed) {
      return
    }

    setIsImporting(true)

    try {
      const accountByPath = new Map(existingAccountPathLookup)
      const sortedDrafts = [...draftsToImport].sort(
        (left, right) =>
          getImportedPathSegments(left.fullPath).length - getImportedPathSegments(right.fullPath).length,
      )

      for (const draft of sortedDrafts) {
        const segments = getImportedPathSegments(draft.fullPath)
        let parentAccountId: string | null = null
        let currentPath = ""

        for (let index = 0; index < segments.length; index += 1) {
          const segment = segments[index]
          currentPath = currentPath ? `${currentPath}:${segment}` : segment
          const normalizedPath = currentPath.toLowerCase()
          const existingAccount = accountByPath.get(normalizedPath)

          if (existingAccount) {
            parentAccountId = existingAccount.id
            continue
          }

          const accountType =
            index === segments.length - 1
              ? draft.accountType
              : inferAccountTypeFromPath(currentPath, draft.accountType)

          let createdAccount = await createAccount({
            id: index === segments.length - 1 ? (draft.sourceAccountId ?? undefined) : undefined,
            name: segment,
            accountType,
            parentAccountId,
            accountNumber: index === segments.length - 1 ? (draft.accountNumber ?? null) : null,
            description: index === segments.length - 1 ? (draft.description ?? null) : null,
            openingBalance: index === segments.length - 1 ? (draft.openingBalance ?? 0) : 0,
          })

          if (index === segments.length - 1) {
            const permissions = await updateAccountPermissions(createdAccount.id, {
              ownerUserId:
                draft.ownerUserId === undefined ? createdAccount.ownerUserId : draft.ownerUserId,
              isGloballyShared: draft.isGloballyShared ?? createdAccount.isGloballyShared,
              reportingMode: draft.reportingMode ?? createdAccount.reportingMode,
              entries: [],
            })

            createdAccount = {
              ...createdAccount,
              ownerUserId: permissions.ownerUserId,
              ownerDisplayName: permissions.ownerDisplayName,
              ownerEmail: permissions.ownerEmail,
              isGloballyShared: permissions.isGloballyShared,
              reportingMode: permissions.reportingMode,
              currentUserPermissions: permissions.currentUserPermissions,
            }
          }

          addAccount(createdAccount)
          accountByPath.set(normalizedPath, createdAccount)
          parentAccountId = createdAccount.id
        }
      }

      await refreshAccounts()
      setDrafts([])
      setFileName(null)
      showSnackbar({
        message: `Imported ${draftsToImport.length} account path${draftsToImport.length === 1 ? "" : "s"}.`,
        tone: "success",
      })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to import account hierarchy.",
        tone: "error",
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold">Source file</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a GnuCash account CSV or an exported hierarchy JSON and review it before importing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={handleExport} disabled={accounts.length === 0}>
            <Download className="size-4" />
            Export JSON
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-sm">
            <Upload className="size-4" />
            <span>Choose File</span>
            <input type="file" accept=".csv,text/csv,.json,application/json" className="sr-only" onChange={handleFileChange} />
          </label>
        </div>
      </div>

      <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        {fileName ? `Loaded file: ${fileName}` : "No hierarchy file loaded yet."}
      </div>

      {normalizedDrafts.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <FolderTree className="size-4" />
              </div>
              <div>
                <h4 className="font-medium">Hierarchy preview</h4>
                <p className="text-sm text-muted-foreground">
                  Review the tree before anything is created.
                </p>
              </div>
            </div>

            <div className="mt-3 max-h-[32rem] overflow-y-auto pr-1">
              {previewNodes.length > 0 ? (
                <ImportedTreeList nodes={previewNodes} />
              ) : (
                <div className="rounded-xl border border-dashed bg-background/70 p-6 text-sm text-muted-foreground">
                  No account paths are currently selected for import.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <FileSpreadsheet className="size-4" />
              </div>
              <div>
                <h4 className="font-medium">Editable entries</h4>
                <p className="text-sm text-muted-foreground">
                  Modify any path or type before import. Existing paths are marked and skipped.
                </p>
              </div>
            </div>

            <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {normalizedDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="grid gap-2 rounded-xl border bg-background/70 p-2.5 md:grid-cols-[minmax(0,1.5fr)_0.8fr_auto_auto]"
                >
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">Full path</span>
                    <Input
                      value={draft.fullPath}
                      onChange={(event) =>
                        updateDraft(draft.id, (current) => ({ ...current, fullPath: event.target.value }))
                      }
                    />
                  </label>

                  <label className="space-y-2 text-sm">
                    <span className="font-medium">Type</span>
                    <Select
                      value={String(draft.accountType)}
                      onValueChange={(value) =>
                        updateDraft(draft.id, (current) => ({
                          ...current,
                          accountType: Number(value) as AccountType,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accountTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={String(option.value)}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                    <Checkbox
                      checked={draft.include}
                      onCheckedChange={(checked) =>
                        updateDraft(draft.id, (current) => ({
                          ...current,
                          include: checked === true,
                        }))
                      }
                    />
                    <span>{draft.isExisting ? "Skip existing" : "Import"}</span>
                  </label>

                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => removeDraft(draft.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {draft.isExisting ? (
                    <p className="md:col-span-4 text-xs text-amber-700">
                      This path already exists in the current account tree and will be skipped.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <p className="text-sm text-muted-foreground">
                {includedDraftCount} path{includedDraftCount === 1 ? "" : "s"} selected for import
              </p>
              <Button type="button" onClick={() => void handleImport()} disabled={isImporting || includedDraftCount === 0}>
                {isImporting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {isImporting ? "Importing..." : "Confirm import"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ImportedTreeList({ nodes }: { nodes: ImportedAccountNode[] }) {
  return (
    <ul className="space-y-1.5">
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="rounded-lg border bg-background/70 px-3 py-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{node.name}</span>
              <span className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                {formatAccountType(node.accountType)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{node.fullPath}</p>
          </div>
          {node.children.length > 0 ? (
            <div className="mt-1.5 border-l border-dashed pl-3">
              <ImportedTreeList nodes={node.children} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

type TreeListProps = {
  nodes: AccountNode[]
  allAccounts: Account[]
  isAdmin: boolean
  isMultiSelectEnabled: boolean
  depth: number
  formatNumber: (value: number, fractionDigits?: number) => string
  balanceLookup: Record<string, number>
  directTransactionAccountIds: Set<string>
  selectedAccountIds: Set<string>
  collapsedIds: Set<string>
  forcedExpandedIds: Set<string>
  activeParentId: string | "root" | null
  onToggleSelected: (accountId: string, checked: boolean) => void
  onToggleCollapsed: (accountId: string) => void
  onOpenLedger: (accountId: string) => void
  onOpenPermissions: (accountId: string) => void
  onActivateCreate: (parentId: string | "root" | null) => void
  renamingAccountId: string | null
  movingAccountId: string | null
  editingOpeningBalanceAccountId: string | null
  openActionsAccountId: string | null
  users: User[]
  isLoadingUsers: boolean
  onToggleActionsMenu: (accountId: string) => void
  onCloseActionsMenu: () => void
  onActivateRename: (accountId: string | null) => void
  onActivateMove: (accountId: string | null) => void
  onActivateOpeningBalanceEdit: (accountId: string | null) => void
  deletingAccountId: string | null
  onDeleteAccount: (account: Account) => void
  onCreated: (account: Account) => void
  onRenamed: (account: Account) => void
  onOpeningBalanceSaved: (account: Account) => void
  onRefreshAccounts: () => Promise<void>
  onCancelCreate: () => void
  onCancelRename: () => void
  onCancelMove: () => void
  onCancelOpeningBalanceEdit: () => void
}

function TreeList({
  nodes,
  allAccounts,
  isAdmin,
  isMultiSelectEnabled,
  depth,
  formatNumber,
  balanceLookup,
  directTransactionAccountIds,
  selectedAccountIds,
  collapsedIds,
  forcedExpandedIds,
  activeParentId,
  onToggleSelected,
  onToggleCollapsed,
  onOpenLedger,
  onOpenPermissions,
  onActivateCreate,
  renamingAccountId,
  movingAccountId,
  editingOpeningBalanceAccountId,
  openActionsAccountId,
  users,
  isLoadingUsers,
  onToggleActionsMenu,
  onCloseActionsMenu,
  onActivateRename,
  onActivateMove,
  onActivateOpeningBalanceEdit,
  deletingAccountId,
  onDeleteAccount,
  onCreated,
  onRenamed,
  onOpeningBalanceSaved,
  onRefreshAccounts,
  onCancelCreate,
  onCancelRename,
  onCancelMove,
  onCancelOpeningBalanceEdit,
}: TreeListProps) {
  return (
    <ul className="space-y-1.5">
      {nodes.map((node) => {
        const isCollapsed = forcedExpandedIds.has(node.id) ? false : collapsedIds.has(node.id)
        const isCreateOpen = activeParentId === node.id
        const isRenameOpen = renamingAccountId === node.id
        const isMoveOpen = movingAccountId === node.id
        const isOpeningBalanceOpen = editingOpeningBalanceAccountId === node.id
        const isSelected = selectedAccountIds.has(node.id)
        const presentation = getAccountTypePresentation(node.accountType)
        const canOpenLedger = node.currentUserPermissions.canView

        return (
          <li key={node.id}>
            <div
              className="rounded-lg border bg-background/70 px-3 py-2"
              style={{ marginLeft: depth === 0 ? 0 : depth * 14 }}
            >
              <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-2">
                  {isMultiSelectEnabled ? (
                    <div className="pt-0.5">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onToggleSelected(node.id, checked === true)}
                        disabled={node.isCore}
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onToggleCollapsed(node.id)}
                    className="mt-0.5 rounded-md border bg-background p-1 text-foreground transition hover:bg-accent hover:text-foreground"
                    aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
                  >
                    <ChevronRight
                      className={`size-3.5 transition ${isCollapsed ? "" : "rotate-90"}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (canOpenLedger) {
                        onOpenLedger(node.id)
                      }
                    }}
                    className={`min-w-0 text-left ${canOpenLedger ? "" : "cursor-not-allowed opacity-60"}`}
                    disabled={!canOpenLedger}
                    title={
                      canOpenLedger
                        ? undefined
                        : "Ledger is unavailable for hierarchy-only parent accounts."
                    }
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={`text-sm font-medium leading-tight transition ${canOpenLedger ? "hover:text-primary" : ""}`}>{node.name}</p>
                      {node.accountNumber ? (
                        <span className="rounded-full border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          #{node.accountNumber}
                        </span>
                      ) : null}
                      {isAdmin ? (
                        <span className="inline-flex items-center rounded-full border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          <UserRound className="mr-1 size-3 shrink-0" />
                          {getAccountOwnerLabel(node)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {node.description?.trim()
                        ? node.description
                        : node.parentAccountId != null
                          ? "Nested account"
                          : "Top-level account"}
                    </p>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <presentation.icon className={`size-3 ${presentation.iconClass}`} />
                    <span>{presentation.label}</span>
                  </div>
                  <div className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
                    <span className="text-muted-foreground">Balance:</span>{" "}
                    <span className="tabular-nums">
                      {formatNumber(getDisplayBalanceForAccount(node.accountType, balanceLookup[node.id] ?? 0))}
                    </span>
                  </div>
                  <div className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {node.children.length} subaccount{node.children.length === 1 ? "" : "s"}
                  </div>
                  {canOpenLedger || node.currentUserPermissions.canManageAccess || (isAdmin && node.isCore) ? (
                    <AccountActionsMenu
                      account={node}
                      isOpen={openActionsAccountId === node.id}
                      isDeleting={deletingAccountId === node.id}
                      onToggle={() => onToggleActionsMenu(node.id)}
                      onClose={onCloseActionsMenu}
                      onViewLedger={() => onOpenLedger(node.id)}
                      canViewLedger={canOpenLedger}
                      viewLedgerTitle={
                        canOpenLedger
                          ? undefined
                          : "Ledger is unavailable for hierarchy-only parent accounts."
                      }
                      onAddSubAccount={() => onActivateCreate(isCreateOpen ? null : node.id)}
                      onRename={() => onActivateRename(isRenameOpen ? null : node.id)}
                      onMove={() => onActivateMove(isMoveOpen ? null : node.id)}
                      onEditOpeningBalance={() =>
                        onActivateOpeningBalanceEdit(isOpeningBalanceOpen ? null : node.id)
                      }
                      onManagePermissions={() => onOpenPermissions(node.id)}
                      onDelete={() => onDeleteAccount(node)}
                    />
                  ) : null}
                </div>
              </div>

              {isCreateOpen ? (
                <div className="mt-2 border-t pt-2">
                  <AccountForm
                    parentAccountId={node.id}
                    parentLabel={node.name}
                    parentAccountType={node.accountType as AccountType}
                    onCancel={onCancelCreate}
                    onCreated={onCreated}
                  />
                </div>
              ) : null}

              {isRenameOpen ? (
                <div className="mt-2 border-t pt-2">
                  <RenameAccountForm
                    account={node}
                    users={users}
                    isAdmin={isAdmin}
                    isLoadingUsers={isLoadingUsers}
                    onCancel={onCancelRename}
                    onRenamed={onRenamed}
                  />
                </div>
              ) : null}

              {isMoveOpen ? (
                <div className="mt-2 border-t pt-2">
                  <MoveAccountForm
                    account={node}
                    availableParents={allAccounts}
                    isAdmin={isAdmin}
                    onRefreshRequested={onRefreshAccounts}
                    onCancel={onCancelMove}
                    onMoved={() => {
                      onCancelMove()
                      onCloseActionsMenu()
                    }}
                  />
                </div>
              ) : null}

              {isOpeningBalanceOpen ? (
                <div className="mt-2 border-t pt-2">
                  <OpeningBalanceForm
                    account={node}
                    onCancel={onCancelOpeningBalanceEdit}
                    onSaved={onOpeningBalanceSaved}
                  />
                </div>
              ) : null}
            </div>

            {!isCollapsed && node.children.length > 0 ? (
              <div className="mt-1.5 border-l border-dashed pl-2.5">
                <TreeList
                  nodes={node.children}
                  allAccounts={allAccounts}
                  isAdmin={isAdmin}
                  isMultiSelectEnabled={isMultiSelectEnabled}
                  depth={depth + 1}
                  formatNumber={formatNumber}
                  balanceLookup={balanceLookup}
                  directTransactionAccountIds={directTransactionAccountIds}
                  selectedAccountIds={selectedAccountIds}
                  collapsedIds={collapsedIds}
                  forcedExpandedIds={forcedExpandedIds}
                  activeParentId={activeParentId}
                  onToggleSelected={onToggleSelected}
                  onToggleCollapsed={onToggleCollapsed}
                  onOpenLedger={onOpenLedger}
                  onOpenPermissions={onOpenPermissions}
                  onActivateCreate={onActivateCreate}
                  renamingAccountId={renamingAccountId}
                  movingAccountId={movingAccountId}
                  editingOpeningBalanceAccountId={editingOpeningBalanceAccountId}
                  openActionsAccountId={openActionsAccountId}
                  users={users}
                  isLoadingUsers={isLoadingUsers}
                  onToggleActionsMenu={onToggleActionsMenu}
                  onCloseActionsMenu={onCloseActionsMenu}
                  onActivateRename={onActivateRename}
                  onActivateMove={onActivateMove}
                  onActivateOpeningBalanceEdit={onActivateOpeningBalanceEdit}
                  deletingAccountId={deletingAccountId}
                  onDeleteAccount={onDeleteAccount}
                  onCreated={onCreated}
                  onRenamed={onRenamed}
                  onOpeningBalanceSaved={onOpeningBalanceSaved}
                  onRefreshAccounts={onRefreshAccounts}
                  onCancelCreate={onCancelCreate}
                  onCancelRename={onCancelRename}
                  onCancelMove={onCancelMove}
                  onCancelOpeningBalanceEdit={onCancelOpeningBalanceEdit}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function BatchAccountUpdateForm({
  accounts,
  selectedAccountIds,
  users,
  isAdmin,
  isLoadingUsers,
  onSelectionChange,
  onCancel,
  onApplied,
}: BatchAccountUpdateFormProps) {
  const { showSnackbar } = useSnackbar()
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  )
  const selectedAccounts = useMemo(
    () =>
      selectedAccountIds
        .map((accountId) => accountById.get(accountId))
        .filter((account): account is Account => account != null),
    [accountById, selectedAccountIds],
  )
  const [applyOwner, setApplyOwner] = useState(false)
  const [selectedOwnerId, setSelectedOwnerId] = useState("__none__")
  const [applyGlobalSharing, setApplyGlobalSharing] = useState(false)
  const [isGloballyShared, setIsGloballyShared] = useState(false)
  const [applyMove, setApplyMove] = useState(false)
  const [selectedParentId, setSelectedParentId] = useState("__unset__")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const pathLookup = useMemo(() => {
    const lookup = new Map<string, string>()

    for (const account of accounts) {
      lookup.set(account.id, buildAccountPathForMove(account.id, accountById))
    }

    return lookup
  }, [accountById, accounts])

  const movableParentOptions = useMemo(
    () => buildBatchMoveParentOptions(accounts, selectedAccounts, isAdmin, pathLookup),
    [accounts, isAdmin, pathLookup, selectedAccounts],
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!applyOwner && !applyGlobalSharing && !applyMove) {
      showSnackbar({
        message: "Select at least one batch setting before applying changes.",
        tone: "error",
      })
      return
    }

    if (applyMove && selectedParentId === "__unset__") {
      showSnackbar({
        message: "Select a destination parent before moving accounts.",
        tone: "error",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const results = await batchUpdateAccounts({
        accountIds: selectedAccounts.map((account) => account.id),
        applyOwner,
        ownerUserId: !applyOwner || selectedOwnerId === "__none__" ? null : selectedOwnerId,
        applyGlobalSharing,
        isGloballyShared,
        applyMove,
        parentAccountId:
          !applyMove || selectedParentId === "__root__" || selectedParentId === "__unset__"
            ? null
            : selectedParentId,
      })

      await onApplied(selectedAccounts, results)
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Unknown error while updating accounts.",
        tone: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Batch update selected accounts</h3>
          <p className="text-xs text-muted-foreground">
            {selectedAccounts.length} account{selectedAccounts.length === 1 ? "" : "s"} selected.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onSelectionChange([])}>
            Clear selection
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Selected accounts
          </p>
          <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
            {selectedAccounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between rounded-xl border bg-background/70 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{pathLookup.get(account.id) ?? account.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatAccountType(account.accountType)} · {getAccountOwnerLabel(account)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onSelectionChange(selectedAccountIds.filter((accountId) => accountId !== account.id))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {isAdmin ? (
            <div className="rounded-xl border bg-background/70 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={applyOwner} onCheckedChange={(checked) => setApplyOwner(checked === true)} />
                <span>Change owner together</span>
              </label>
              {applyOwner ? (
                <div className="mt-3">
                  <Select
                    value={selectedOwnerId}
                    onValueChange={setSelectedOwnerId}
                    disabled={isLoadingUsers}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder={isLoadingUsers ? "Loading users..." : "Select owner"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No owner</SelectItem>
                      {users.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.displayName} ({item.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}

          {isAdmin ? (
            <div className="rounded-xl border bg-background/70 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={applyGlobalSharing}
                  onCheckedChange={(checked) => setApplyGlobalSharing(checked === true)}
                />
                <span>Check globally shared or not</span>
              </label>
              {applyGlobalSharing ? (
                <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={isGloballyShared}
                    onCheckedChange={(checked) => setIsGloballyShared(checked === true)}
                  />
                  <span>Mark selected accounts as globally shared</span>
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-xl border bg-background/70 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={applyMove} onCheckedChange={(checked) => setApplyMove(checked === true)} />
              <span>Move</span>
            </label>
            {applyMove ? (
              <div className="mt-3 space-y-2">
                <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select destination parent" />
                  </SelectTrigger>
                  <SelectContent>
                    {isAdmin ? <SelectItem value="__root__">Top level</SelectItem> : null}
                    {movableParentOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Moving under another core branch changes the selected subtree type to match the destination.
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={isSubmitting || selectedAccounts.length === 0}>
              {isSubmitting ? "Applying..." : "Apply changes"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}

function AccountForm({
  parentAccountId,
  parentLabel,
  parentAccountType,
  onCancel,
  onCreated,
}: AccountFormProps) {
  const { showSnackbar } = useSnackbar()
  const [name, setName] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [description, setDescription] = useState("")
  const [accountType, setAccountType] = useState<AccountType>(parentAccountType ?? 1)
  const [openingBalance, setOpeningBalance] = useState("0")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSubaccount = parentAccountId != null

  useEffect(() => {
    setAccountType(parentAccountType ?? 1)
  }, [parentAccountType])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const payload: CreateAccountInput = {
        name,
        accountNumber: accountNumber.trim() || null,
        description: description.trim() || null,
        accountType: parentAccountType ?? accountType,
        parentAccountId,
        openingBalance: Number(openingBalance) || 0,
      }

      const account = await createAccount(payload)
      setName("")
      setAccountNumber("")
      setDescription("")
      setAccountType(parentAccountType ?? 1)
      setOpeningBalance("0")
      onCreated(account)
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Unknown error while creating account.",
        tone: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Create account</h3>
          <p className="text-xs text-muted-foreground">
            Under: {parentLabel}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Name</span>
          <Input
            className="h-8"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Account name"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Account number</span>
          <Input
            className="h-8"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            placeholder="Optional"
            maxLength={50}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Type</span>
          <Select
            value={String(accountType)}
            onValueChange={(value) => setAccountType(Number(value) as AccountType)}
            disabled={isSubaccount}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {accountTypeOptions.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSubaccount ? (
            <p className="text-xs text-muted-foreground">
              Subaccounts use the same type as their parent.
            </p>
          ) : null}
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Opening balance</span>
          <Input
            className="h-8"
            type="number"
            step="0.01"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
            placeholder="0.00"
          />
        </label>

        <label className="space-y-1 text-sm md:col-span-3">
          <span className="font-medium">Description</span>
          <Input
            className="h-8"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional notes for this account"
            maxLength={500}
          />
        </label>

        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  )
}

function RenameAccountForm({
  account,
  users,
  isAdmin,
  isLoadingUsers,
  onCancel,
  onRenamed,
}: RenameAccountFormProps) {
  const { showSnackbar } = useSnackbar()
  const [name, setName] = useState(account.name)
  const [accountNumber, setAccountNumber] = useState(account.accountNumber ?? "")
  const [description, setDescription] = useState(account.description ?? "")
  const [selectedOwnerId, setSelectedOwnerId] = useState(account.ownerUserId ?? "__none__")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      let updatedAccount = await renameAccount(account.id, {
        name,
        accountNumber: accountNumber.trim() || null,
        description: description.trim() || null,
        openingBalance: account.openingBalance,
        parentAccountId: account.parentAccountId,
      })

      if (isAdmin) {
        const nextOwnerUserId = selectedOwnerId === "__none__" ? null : selectedOwnerId
        if (nextOwnerUserId !== account.ownerUserId) {
          updatedAccount = await updateAccountOwner(account.id, nextOwnerUserId)
        }
      }

      onRenamed(updatedAccount)
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Unknown error while renaming account.",
        tone: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Edit account</h3>
          <p className="text-xs text-muted-foreground">
            Opening balance stays {account.openingBalance.toFixed(2)} while you edit account metadata.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto]">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Name</span>
          <Input
            className="h-8"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Account name"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Account number</span>
          <Input
            className="h-8"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            placeholder="Optional"
            maxLength={50}
          />
        </label>

        {isAdmin ? (
          <label className="space-y-1 text-sm">
            <span className="font-medium">Linked user</span>
            <Select
              value={selectedOwnerId}
              onValueChange={setSelectedOwnerId}
              disabled={isLoadingUsers}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder={isLoadingUsers ? "Loading users..." : "Select user"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No owner</SelectItem>
                {users.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.displayName} ({item.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}

        <label className="space-y-1 text-sm md:col-span-3">
          <span className="font-medium">Description</span>
          <Input
            className="h-8"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional notes for this account"
            maxLength={500}
          />
        </label>

        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            <Pencil />
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  )
}

function MoveAccountForm({
  account,
  availableParents,
  isAdmin,
  onRefreshRequested,
  onCancel,
  onMoved,
}: MoveAccountFormProps) {
  const { showSnackbar } = useSnackbar()
  const [selectedParentId, setSelectedParentId] = useState(account.parentAccountId ?? "__root__")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const selectedParent = useMemo(
    () =>
      selectedParentId === "__root__"
        ? null
        : availableParents.find((item) => item.id === selectedParentId) ?? null,
    [availableParents, selectedParentId],
  )
  const movableParentOptions = useMemo(
    () => buildMoveParentOptions(availableParents, account, isAdmin),
    [account, availableParents, isAdmin],
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const [result] = await batchUpdateAccounts({
        accountIds: [account.id],
        applyOwner: false,
        ownerUserId: null,
        applyGlobalSharing: false,
        isGloballyShared: account.isGloballyShared,
        applyMove: true,
        parentAccountId: selectedParentId === "__root__" ? null : selectedParentId,
      })

      await onRefreshRequested()
      await onMoved()
      showSnackbar({
        message: result.accountTypeChanged
          ? `Moved ${account.name}. The account type changed to ${formatAccountType(selectedParent?.accountType ?? account.accountType)}.`
          : `Moved ${account.name}.`,
        tone: "success",
      })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Unknown error while moving account.",
        tone: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Move account</h3>
          <p className="text-xs text-muted-foreground">
            Move {account.name} under another parent. If the destination is in another core branch, the moved subtree adopts that branch type.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Parent account</span>
          <Select value={selectedParentId} onValueChange={setSelectedParentId}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select parent" />
            </SelectTrigger>
            <SelectContent>
              {isAdmin ? <SelectItem value="__root__">Top level</SelectItem> : null}
              {movableParentOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="flex items-end gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={
              isSubmitting ||
              (selectedParentId === "__root__" ? null : selectedParentId) === account.parentAccountId
            }
          >
            <FolderTree />
            {isSubmitting ? "Moving..." : "Move"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  )
}

function OpeningBalanceForm({ account, onCancel, onSaved }: OpeningBalanceFormProps) {
  const { showSnackbar } = useSnackbar()
  const [openingBalance, setOpeningBalance] = useState(String(account.openingBalance))
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const updatedAccount = await renameAccount(account.id, {
        name: account.name,
        accountNumber: account.accountNumber,
        description: account.description,
        openingBalance: Number(openingBalance) || 0,
        parentAccountId: account.parentAccountId,
      })
      onSaved(updatedAccount)
    } catch (error) {
      showSnackbar({
        message:
          error instanceof Error ? error.message : "Unknown error while updating opening balance.",
        tone: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Edit opening balance</h3>
          <p className="text-xs text-muted-foreground">
            Account name stays {account.name} while you update the starting balance.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Opening balance</span>
          <Input
            className="h-8"
            type="number"
            step="0.01"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
            placeholder="0.00"
          />
        </label>

        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            <Pencil />
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  )
}

type AccountActionsMenuProps = {
  account: AccountNode
  isOpen: boolean
  isDeleting: boolean
  onToggle: () => void
  onClose: () => void
  onViewLedger: () => void
  canViewLedger: boolean
  viewLedgerTitle?: string
  onAddSubAccount: () => void
  onRename: () => void
  onMove: () => void
  onEditOpeningBalance: () => void
  onManagePermissions: () => void
  onDelete: () => void
}

function AccountActionsMenu({
  account,
  isOpen,
  isDeleting,
  onToggle,
  onClose,
  onViewLedger,
  canViewLedger,
  viewLedgerTitle,
  onAddSubAccount,
  onRename,
  onMove,
  onEditOpeningBalance,
  onManagePermissions,
  onDelete,
}: AccountActionsMenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canDelete = !account.isCore && account.children.length === 0 && !isDeleting

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener("mousedown", handlePointerDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [isOpen, onClose])

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant={isOpen ? "secondary" : "outline"}
        className="h-7 px-2 text-[11px]"
        onClick={onToggle}
        aria-label={`Open actions for ${account.name}`}
      >
        <EllipsisVertical className="size-3.5" />
        <span>Actions</span>
      </Button>

      {isOpen ? (
        <div className="absolute right-0 top-9 z-20 min-w-44 rounded-xl border bg-popover p-1.5 shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              onViewLedger()
              onClose()
            }}
            disabled={!canViewLedger}
            title={viewLedgerTitle}
          >
            <ListTree className="size-4" />
            <span>View Ledger</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted"
            onClick={() => {
              onAddSubAccount()
              onClose()
            }}
          >
            <FolderPlus className="size-4" />
            <span>Add SubAccount</span>
          </button>
          {!account.isCore ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted"
              onClick={() => {
                onRename()
                onClose()
              }}
            >
              <Pencil className="size-4" />
              <span>Edit Account</span>
            </button>
          ) : null}
          {!account.isCore ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted"
              onClick={() => {
                onMove()
                onClose()
              }}
            >
              <FolderTree className="size-4" />
              <span>Move Account</span>
            </button>
          ) : null}
          {!account.isCore ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted"
              onClick={() => {
                onEditOpeningBalance()
                onClose()
              }}
            >
              <Pencil className="size-4" />
              <span>Edit Opening Balance</span>
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted"
            onClick={() => {
              onManagePermissions()
              onClose()
            }}
            disabled={account.isCore}
          >
            <UserRound className="size-4" />
            <span>Permissions</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              onDelete()
              onClose()
            }}
            disabled={!canDelete}
            title={
              account.children.length > 0
                ? "Delete is only available for accounts without subaccounts."
                : undefined
            }
          >
            <Trash2 className="size-4" />
            <span>{isDeleting ? "Deleting..." : "Delete"}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

function getAccountTypePresentation(accountType: number | string | null) {
  if (accountType === 5 || accountType === "Expense") {
    return {
      label: "Expense",
      icon: ArrowDownCircle,
      iconClass: "text-rose-600 dark:text-rose-400",
    }
  }

  if (accountType === 4 || accountType === "Income") {
    return {
      label: "Income",
      icon: ArrowUpCircle,
      iconClass: "text-emerald-600 dark:text-emerald-400",
    }
  }

  if (accountType === 1 || accountType === "Asset") {
    return {
      label: "Asset",
      icon: Landmark,
      iconClass: "text-sky-600 dark:text-sky-400",
    }
  }

  if (accountType === 2 || accountType === "Liability") {
    return {
      label: "Liability",
      icon: Briefcase,
      iconClass: "text-amber-600 dark:text-amber-400",
    }
  }

  return {
    label: formatAccountType(accountType ?? "Unknown"),
    icon: CircleDashed,
    iconClass: "text-muted-foreground",
  }
}

function buildExistingAccountPathLookup(accounts: Account[]) {
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const pathLookup = new Map<string, Account>()

  function buildPath(account: Account) {
    const segments: string[] = [account.name]
    let parentAccountId = account.parentAccountId

    while (parentAccountId) {
      const parent = accountById.get(parentAccountId)
      if (!parent) {
        break
      }

      segments.unshift(parent.name)
      parentAccountId = parent.parentAccountId
    }

    return normalizeImportedFullPath(segments.join(":"))
  }

  for (const account of accounts) {
    pathLookup.set(buildPath(account).toLowerCase(), account)
  }

  return pathLookup
}

function parseGnuCashAccountCsv(
  source: string,
  existingAccountPathLookup: Map<string, Account>,
) {
  const rows = parseCsvRows(source)
  if (rows.length < 2) {
    throw new Error("Account CSV did not contain any data rows.")
  }

  const headers = rows[0].map((value) => value.trim())
  const typeIndex = headers.findIndex((value) => value.toLowerCase() === "type")
  const fullPathIndex = headers.findIndex((value) => value.toLowerCase() === "full account name")
  const hiddenIndex = headers.findIndex((value) => value.toLowerCase() === "hidden")

  if (typeIndex < 0 || fullPathIndex < 0) {
    throw new Error("Account CSV must contain Type and Full Account Name columns.")
  }

  const drafts: ImportedAccountDraft[] = []

  rows.slice(1).forEach((row, index) => {
    const fullPath = normalizeImportedFullPath(row[fullPathIndex] ?? "")
    if (!fullPath) {
      return
    }

    const isHidden = String(row[hiddenIndex] ?? "F").trim().toUpperCase() === "T"
    if (isHidden) {
      return
    }

    const accountType = mapImportedAccountType(row[typeIndex] ?? "")
    drafts.push({
      id: `imported-account-${index}`,
      fullPath,
      accountType,
      include: true,
      isExisting: existingAccountPathLookup.has(fullPath.toLowerCase()),
    })
  })

  return drafts
}

function parseCsvRows(source: string) {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ""
  let insideQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const nextChar = source[index + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }

      continue
    }

    if (!insideQuotes && char === ",") {
      currentRow.push(currentCell.trim())
      currentCell = ""
      continue
    }

    if (!insideQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        index += 1
      }

      currentRow.push(currentCell.trim())
      currentCell = ""

      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow)
      }

      currentRow = []
      continue
    }

    currentCell += char
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim())
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow)
    }
  }

  return rows
}

function normalizeImportedFullPath(value: string) {
  return value
    .split(":")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(":")
}

function getImportedPathSegments(fullPath: string) {
  return normalizeImportedFullPath(fullPath)
    .split(":")
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function mapImportedAccountType(value: string): AccountType {
  switch (value.trim().toUpperCase()) {
    case "ASSET":
    case "BANK":
    case "CASH":
      return 1
    case "LIABILITY":
    case "CREDIT":
      return 2
    case "EQUITY":
      return 3
    case "INCOME":
      return 4
    case "EXPENSE":
      return 5
    default:
      return 1
  }
}

function inferAccountTypeFromPath(fullPath: string, fallback: AccountType) {
  const rootSegment = getImportedPathSegments(fullPath)[0]?.toLowerCase()

  if (rootSegment === "assets" || rootSegment === "asset") {
    return 1
  }

  if (rootSegment === "liabilities" || rootSegment === "liability") {
    return 2
  }

  if (rootSegment === "equity") {
    return 3
  }

  if (rootSegment === "income") {
    return 4
  }

  if (rootSegment === "expenses" || rootSegment === "expense") {
    return 5
  }

  return fallback
}

function buildImportedAccountTree(drafts: ImportedAccountDraft[]) {
  const nodeByPath = new Map<string, ImportedAccountNode>()
  const roots: ImportedAccountNode[] = []

  for (const draft of drafts) {
    const segments = getImportedPathSegments(draft.fullPath)
    let currentPath = ""
    let parentNode: ImportedAccountNode | null = null

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      currentPath = currentPath ? `${currentPath}:${segment}` : segment
      let node = nodeByPath.get(currentPath)

      if (!node) {
        node = {
          id: currentPath,
          name: segment,
          fullPath: currentPath,
          accountType: draft.accountType,
          children: [],
        }

        nodeByPath.set(currentPath, node)

        if (parentNode) {
          parentNode.children.push(node)
        } else {
          roots.push(node)
        }
      }

      if (index === segments.length - 1) {
        node.accountType = draft.accountType
      }

      parentNode = node
    }
  }

  return roots
}

function buildAccountHierarchyExport(accounts: Account[]): ExportedAccountHierarchy {
  const tree = buildAccountTree(accounts)

  function mapNode(node: AccountNode): ExportedAccountHierarchyNode {
    return {
      id: node.id,
      name: node.name,
      accountType: normalizeExportedAccountType(node.accountType),
      ownerUserId: node.ownerUserId,
      accountNumber: node.accountNumber,
      description: node.description,
      openingBalance: node.openingBalance,
      reportingMode: node.reportingMode,
      isGloballyShared: node.isGloballyShared,
      children: node.children.map(mapNode),
    }
  }

  return {
    format: "finance.account_hierarchy",
    version: 1,
    exportedAt: new Date().toISOString(),
    tree: tree.map(mapNode),
  }
}

function normalizeExportedAccountType(accountType: Account["accountType"]): AccountType {
  if (accountType === 2 || accountType === "Liability") {
    return 2
  }

  if (accountType === 3 || accountType === "Equity") {
    return 3
  }

  if (accountType === 4 || accountType === "Income") {
    return 4
  }

  if (accountType === 5 || accountType === "Expense") {
    return 5
  }

  return 1
}

function parseExportedAccountHierarchy(
  source: string,
  existingAccountPathLookup: Map<string, Account>,
) {
  let parsed: unknown

  try {
    parsed = JSON.parse(source)
  } catch {
    throw new Error("Account hierarchy JSON is not valid.")
  }

  const value = parsed as Partial<ExportedAccountHierarchy> | null
  if (
    value == null
    || value.format !== "finance.account_hierarchy"
    || value.version !== 1
    || !Array.isArray(value.tree)
  ) {
    throw new Error("Unsupported account hierarchy export format.")
  }

  const drafts: ImportedAccountDraft[] = []
  let index = 0

  function visit(nodes: ExportedAccountHierarchyNode[], parentPath: string) {
    for (const node of nodes) {
      const fullPath = normalizeImportedFullPath(
        parentPath ? `${parentPath}:${node.name}` : node.name,
      )

      drafts.push({
        id: `imported-account-${index}`,
        fullPath,
        accountType: node.accountType,
        description: node.description,
        accountNumber: node.accountNumber,
        openingBalance: node.openingBalance,
        ownerUserId: node.ownerUserId,
        reportingMode: node.reportingMode,
        isGloballyShared: node.isGloballyShared,
        sourceAccountId: node.id,
        include: true,
        isExisting: existingAccountPathLookup.has(fullPath.toLowerCase()),
      })
      index += 1

      visit(node.children ?? [], fullPath)
    }
  }

  visit(value.tree, "")
  return drafts
}

function downloadJsonFile(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function collectBranchAccountIds(nodes: AccountNode[]) {
  const ids: string[] = []

  for (const node of nodes) {
    if (node.children.length > 0) {
      ids.push(node.id)
      ids.push(...collectBranchAccountIds(node.children))
    }
  }

  return ids
}

function filterAccountTree(nodes: AccountNode[], searchTerm: string) {
  if (!searchTerm) {
    return {
      nodes,
      forcedExpandedIds: new Set<string>(),
    }
  }

  const forcedExpandedIds = new Set<string>()

  function visit(node: AccountNode): AccountNode | null {
    const filteredChildren = node.children
      .map((child) => visit(child))
      .filter((child): child is AccountNode => child != null)
    const matchesSelf =
      node.name.toLowerCase().includes(searchTerm) ||
      (node.accountNumber ?? "").toLowerCase().includes(searchTerm) ||
      (node.description ?? "").toLowerCase().includes(searchTerm)
    const hasMatchingDescendant = filteredChildren.length > 0

    if (!matchesSelf && !hasMatchingDescendant) {
      return null
    }

    if (hasMatchingDescendant) {
      forcedExpandedIds.add(node.id)
    }

    return {
      ...node,
      children: filteredChildren,
    }
  }

  return {
    nodes: nodes
      .map((node) => visit(node))
      .filter((node): node is AccountNode => node != null),
    forcedExpandedIds,
  }
}

function buildMoveParentOptions(accounts: Account[], account: Account, isAdmin: boolean) {
  const accountById = new Map(accounts.map((item) => [item.id, item]))
  const excludedIds = new Set<string>([account.id])
  const stack = [account.id]

  while (stack.length > 0) {
    const currentId = stack.pop()
    if (!currentId) {
      continue
    }

    for (const candidate of accounts) {
      if (candidate.parentAccountId !== currentId || excludedIds.has(candidate.id)) {
        continue
      }

      excludedIds.add(candidate.id)
      stack.push(candidate.id)
    }
  }

  return accounts
    .filter((candidate) => {
      if (excludedIds.has(candidate.id)) {
        return false
      }

      if (!isAdmin && !candidate.currentUserPermissions.canManageAccess) {
        return false
      }

      return true
    })
    .map((candidate) => ({
      id: candidate.id,
      label: `${buildAccountPathForMove(candidate.id, accountById)} · ${formatAccountType(candidate.accountType)}`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

function buildBatchMoveParentOptions(
  accounts: Account[],
  selectedAccounts: Account[],
  isAdmin: boolean,
  pathLookup: Map<string, string>,
) {
  if (selectedAccounts.length === 0) {
    return []
  }

  const selectedIds = new Set(selectedAccounts.map((account) => account.id))
  const excludedIds = new Set<string>(selectedIds)
  const stack = [...selectedIds]

  while (stack.length > 0) {
    const currentId = stack.pop()
    if (!currentId) {
      continue
    }

    for (const candidate of accounts) {
      if (candidate.parentAccountId !== currentId || excludedIds.has(candidate.id)) {
        continue
      }

      excludedIds.add(candidate.id)
      stack.push(candidate.id)
    }
  }

  return accounts
    .filter((candidate) => {
      if (excludedIds.has(candidate.id)) {
        return false
      }

      if (!isAdmin && !candidate.currentUserPermissions.canManageAccess) {
        return false
      }

      return true
    })
    .map((candidate) => ({
      id: candidate.id,
      label: `${pathLookup.get(candidate.id) ?? candidate.name} · ${formatAccountType(candidate.accountType)}`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

function buildAccountPathForMove(accountId: string, accountById: Map<string, Account>) {
  const segments: string[] = []
  let current = accountById.get(accountId)

  while (current) {
    segments.unshift(current.name)
    current = current.parentAccountId ? accountById.get(current.parentAccountId) : undefined
  }

  return segments.join(" / ")
}
