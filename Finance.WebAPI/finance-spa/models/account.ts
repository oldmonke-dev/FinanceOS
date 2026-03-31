export type AccountType = 1 | 2 | 3 | 4 | 5

export type AccountReportingMode = "Included" | "OperationalOnly" | "Excluded"

export type AccountPermissionSummary = {
  canView: boolean
  canPost: boolean
  canEditTransaction: boolean
  canDeleteTransaction: boolean
  canManageAccess: boolean
  canChangeOwner: boolean
  isOwner: boolean
}

export type AccountAccessEntry = {
  userId: string
  userDisplayName: string
  userEmail: string
  isAdmin: boolean
  canView: boolean
  canPost: boolean
  canEditTransaction: boolean
  canDeleteTransaction: boolean
  canManageAccess: boolean
}

export type AccountPermissionUserOption = {
  id: string
  displayName: string
  email: string
  isAdmin: boolean
}

export type AccountPermissionsDetails = {
  accountId: string
  accountName: string
  ownerUserId: string | null
  ownerDisplayName: string | null
  ownerEmail: string | null
  isGloballyShared: boolean
  reportingMode: AccountReportingMode
  currentUserPermissions: AccountPermissionSummary
  entries: AccountAccessEntry[]
  availableUsers: AccountPermissionUserOption[]
}

export type Account = {
  id: string
  name: string
  accountNumber: string | null
  description: string | null
  accountType: AccountType | string
  parentAccountId: string | null
  openingBalance: number
  isCore: boolean
  isGloballyShared: boolean
  ownerUserId: string | null
  ownerDisplayName: string | null
  ownerEmail: string | null
  reportingMode: AccountReportingMode
  currentUserPermissions: AccountPermissionSummary
}

export type CreateAccountInput = {
  id?: string
  name: string
  accountNumber?: string | null
  description?: string | null
  accountType: AccountType
  parentAccountId: string | null
  openingBalance: number
}

export type AccountNode = Account & {
  children: AccountNode[]
}

export type BatchUpdateAccountsInput = {
  accountIds: string[]
  applyOwner: boolean
  ownerUserId: string | null
  applyGlobalSharing: boolean
  isGloballyShared: boolean
  applyMove: boolean
  parentAccountId: string | null
}

export type BatchUpdateAccountResult = {
  id: string
  name: string
  updatedNodeCount: number
  accountTypeChanged: boolean
}
