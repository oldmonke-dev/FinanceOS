import {
  type Account,
  type AccountAccessEntry,
  type AccountNode,
  type AccountPermissionSummary,
  type AccountPermissionUserOption,
  type AccountPermissionsDetails,
  type AccountReportingMode,
  type CreateAccountInput,
} from "@/models/account"
import { authFetch } from "@/lib/auth"
import { API_BASE_URL } from "@/lib/api-config"

function normalizeAccountPermissionSummary(raw: Record<string, unknown> | null | undefined): AccountPermissionSummary {
  return {
    canView: Boolean(raw?.canView ?? raw?.CanView ?? false),
    canPost: Boolean(raw?.canPost ?? raw?.CanPost ?? false),
    canEditTransaction: Boolean(raw?.canEditTransaction ?? raw?.CanEditTransaction ?? false),
    canDeleteTransaction: Boolean(raw?.canDeleteTransaction ?? raw?.CanDeleteTransaction ?? false),
    canManageAccess: Boolean(raw?.canManageAccess ?? raw?.CanManageAccess ?? false),
    canChangeOwner: Boolean(raw?.canChangeOwner ?? raw?.CanChangeOwner ?? false),
    isOwner: Boolean(raw?.isOwner ?? raw?.IsOwner ?? false),
  }
}

function normalizeAccount(raw: Record<string, unknown>): Account {
  return {
    id: String(raw.id ?? raw.Id ?? ""),
    name: String(raw.name ?? raw.Name ?? "Unnamed account"),
    accountNumber:
      raw.accountNumber == null && raw.AccountNumber == null
        ? null
        : String(raw.accountNumber ?? raw.AccountNumber),
    description:
      raw.description == null && raw.Description == null
        ? null
        : String(raw.description ?? raw.Description),
    accountType: (raw.accountType ?? raw.AccountType ?? "Unknown") as
      | Account["accountType"]
      | string,
    parentAccountId:
      raw.parentAccountId == null && raw.ParentAccountId == null
        ? null
        : String(raw.parentAccountId ?? raw.ParentAccountId),
    openingBalance: Number(raw.openingBalance ?? raw.OpeningBalance ?? 0),
    isCore: Boolean(raw.isCore ?? raw.IsCore ?? false),
    isGloballyShared: Boolean(raw.isGloballyShared ?? raw.IsGloballyShared ?? false),
    ownerUserId:
      raw.ownerUserId == null && raw.OwnerUserId == null
        ? null
        : String(raw.ownerUserId ?? raw.OwnerUserId),
    ownerDisplayName:
      raw.ownerDisplayName == null && raw.OwnerDisplayName == null
        ? null
        : String(raw.ownerDisplayName ?? raw.OwnerDisplayName),
    ownerEmail:
      raw.ownerEmail == null && raw.OwnerEmail == null
        ? null
        : String(raw.ownerEmail ?? raw.OwnerEmail),
    reportingMode: String(
      raw.reportingMode ?? raw.ReportingMode ?? "Included",
    ) as AccountReportingMode,
    currentUserPermissions: normalizeAccountPermissionSummary(
      (raw.currentUserPermissions ?? raw.CurrentUserPermissions ?? null) as
        | Record<string, unknown>
        | null
        | undefined,
    ),
  }
}

function normalizeAccountAccessEntry(raw: Record<string, unknown>): AccountAccessEntry {
  return {
    userId: String(raw.userId ?? raw.UserId ?? ""),
    userDisplayName: String(raw.userDisplayName ?? raw.UserDisplayName ?? "Unknown user"),
    userEmail: String(raw.userEmail ?? raw.UserEmail ?? ""),
    isAdmin: Boolean(raw.isAdmin ?? raw.IsAdmin ?? false),
    canView: Boolean(raw.canView ?? raw.CanView ?? false),
    canPost: Boolean(raw.canPost ?? raw.CanPost ?? false),
    canEditTransaction: Boolean(raw.canEditTransaction ?? raw.CanEditTransaction ?? false),
    canDeleteTransaction: Boolean(raw.canDeleteTransaction ?? raw.CanDeleteTransaction ?? false),
    canManageAccess: Boolean(raw.canManageAccess ?? raw.CanManageAccess ?? false),
  }
}

function normalizeAccountPermissionUserOption(raw: Record<string, unknown>): AccountPermissionUserOption {
  return {
    id: String(raw.id ?? raw.Id ?? ""),
    displayName: String(raw.displayName ?? raw.DisplayName ?? "Unknown user"),
    email: String(raw.email ?? raw.Email ?? ""),
    isAdmin: Boolean(raw.isAdmin ?? raw.IsAdmin ?? false),
  }
}

function readErrorMessage(response: Response, fallback: string) {
  return response
    .json()
    .then((error) => {
      if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
        return error.message
      }

      return fallback
    })
    .catch(() => fallback)
}

export async function getAccounts(): Promise<Account[]> {
  const response = await authFetch(`${API_BASE_URL}/Accounts`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch accounts: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as unknown

  if (!Array.isArray(data)) {
    throw new Error("Accounts response was not an array")
  }

  return data.map((item) => normalizeAccount(item as Record<string, unknown>))
}

export async function createAccount(account: CreateAccountInput): Promise<Account> {
  const response = await authFetch(`${API_BASE_URL}/Accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(account),
  })

  if (!response.ok) {
    let message = `Failed to create account: ${response.status} ${response.statusText}`

    try {
      const error = (await response.json()) as { message?: string }
      if (error.message) {
        message = error.message
      }
    } catch {}

    throw new Error(message)
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeAccount(data)
}

export async function deleteAccount(accountId: string): Promise<{
  deletedAccountId: string
  createdImportSessionId: string | null
  affectedTransactionCount: number
}> {
  const response = await authFetch(`${API_BASE_URL}/Accounts/${accountId}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to delete account: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>

  return {
    deletedAccountId: String(data.deletedAccountId ?? data.DeletedAccountId ?? accountId),
    createdImportSessionId:
      data.createdImportSessionId == null && data.CreatedImportSessionId == null
        ? null
        : String(data.createdImportSessionId ?? data.CreatedImportSessionId),
    affectedTransactionCount: Number(
      data.affectedTransactionCount ?? data.AffectedTransactionCount ?? 0,
    ),
  }
}

export async function renameAccount(
  accountId: string,
  input: {
    name: string
    accountNumber?: string | null
    description?: string | null
    openingBalance: number
    parentAccountId: string | null
  },
): Promise<Account> {
  const response = await authFetch(`${API_BASE_URL}/Accounts/${accountId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to rename account: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeAccount(data)
}

export async function updateAccountOwner(
  accountId: string,
  ownerUserId: string | null,
): Promise<Account> {
  const response = await authFetch(`${API_BASE_URL}/Accounts/${accountId}/owner`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ ownerUserId }),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to update account owner: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeAccount(data)
}

export async function getAccountPermissions(accountId: string): Promise<AccountPermissionsDetails> {
  const response = await authFetch(`${API_BASE_URL}/Accounts/${accountId}/permissions`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to fetch account permissions: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  const rawEntries = (Array.isArray(data.entries ?? data.Entries)
    ? (data.entries ?? data.Entries)
    : []) as unknown[]
  const rawUsers = Array.isArray(data.availableUsers ?? data.AvailableUsers)
    ? ((data.availableUsers ?? data.AvailableUsers) as unknown[])
    : []

  return {
    accountId: String(data.accountId ?? data.AccountId ?? accountId),
    accountName: String(data.accountName ?? data.AccountName ?? "Account"),
    ownerUserId:
      data.ownerUserId == null && data.OwnerUserId == null
        ? null
        : String(data.ownerUserId ?? data.OwnerUserId),
    ownerDisplayName:
      data.ownerDisplayName == null && data.OwnerDisplayName == null
        ? null
        : String(data.ownerDisplayName ?? data.OwnerDisplayName),
    ownerEmail:
      data.ownerEmail == null && data.OwnerEmail == null
        ? null
        : String(data.ownerEmail ?? data.OwnerEmail),
    isGloballyShared: Boolean(data.isGloballyShared ?? data.IsGloballyShared ?? false),
    reportingMode: String(
      data.reportingMode ?? data.ReportingMode ?? "Included",
    ) as AccountReportingMode,
    currentUserPermissions: normalizeAccountPermissionSummary(
      (data.currentUserPermissions ?? data.CurrentUserPermissions ?? null) as
        | Record<string, unknown>
        | null
        | undefined,
    ),
    entries: rawEntries.map((entry) => normalizeAccountAccessEntry(entry as Record<string, unknown>)),
    availableUsers: rawUsers.map((user) =>
      normalizeAccountPermissionUserOption(user as Record<string, unknown>),
    ),
  }
}

export async function updateAccountPermissions(
  accountId: string,
    input: {
      ownerUserId: string | null
      isGloballyShared: boolean
      reportingMode: AccountReportingMode
      entries: AccountAccessEntry[]
    },
): Promise<AccountPermissionsDetails> {
  const response = await authFetch(`${API_BASE_URL}/Accounts/${accountId}/permissions`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to update account permissions: ${response.status} ${response.statusText}`,
      ),
    )
  }

  return getAccountPermissions(accountId)
}

export function buildAccountTree(accounts: Account[]): AccountNode[] {
  const nodes = new Map<string, AccountNode>()

  for (const account of accounts) {
    nodes.set(account.id, { ...account, children: [] })
  }

  const roots: AccountNode[] = []

  for (const account of accounts) {
    const node = nodes.get(account.id)

    if (!node) {
      continue
    }

    if (account.parentAccountId == null || !nodes.has(account.parentAccountId)) {
      roots.push(node)
      continue
    }

    nodes.get(account.parentAccountId)?.children.push(node)
  }

  const sortTree = (items: AccountNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name))
    for (const item of items) {
      sortTree(item.children)
    }
  }

  sortTree(roots)

  return roots
}

export function buildAccountPathLookup(accounts: Account[]) {
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
}

export function getAccountOwnerLabel(account: Account) {
  if (account.isCore) {
    return "Core Account"
  }

  if (account.isGloballyShared) {
    return "Globally Shared"
  }

  if (!account.ownerUserId) {
    return "Globally Shared"
  }

  return account.ownerDisplayName?.trim() || account.ownerEmail?.trim() || account.ownerUserId
}

export function formatAccountReportingMode(reportingMode: AccountReportingMode) {
  if (reportingMode === "OperationalOnly") {
    return "Operational only"
  }

  if (reportingMode === "Excluded") {
    return "Excluded"
  }

  return "Included"
}

export function getAccountAdminLabel(account: Account, accountPathLookup: Map<string, string>) {
  const path = accountPathLookup.get(account.id) ?? account.name
  return `${path} · ${getAccountOwnerLabel(account)}`
}

export function formatAccountType(accountType: number | string) {
  if (typeof accountType === "string") {
    return accountType
  }

  const labels: Record<number, string> = {
    1: "Asset",
    2: "Liability",
    3: "Equity",
    4: "Income",
    5: "Expense",
  }

  return labels[accountType] ?? `Type ${accountType}`
}
