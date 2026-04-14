import { buildAccountTree } from "@/lib/accounts"
import { type Account, type AccountNode, type AccountReportingMode, type AccountType } from "@/models/account"

export type ImportedAccountDraft = {
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

export type ExportedAccountHierarchyNode = {
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

export type ExportedAccountHierarchy = {
  format: "finance.account_hierarchy"
  version: 1
  exportedAt: string
  tree: ExportedAccountHierarchyNode[]
}

export type ImportedAccountNode = {
  id: string
  name: string
  fullPath: string
  accountType: AccountType
  children: ImportedAccountNode[]
}

export function normalizeImportedFullPath(value: string) {
  return value
    .split(":")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(":")
}

export function getImportedPathSegments(fullPath: string) {
  return normalizeImportedFullPath(fullPath)
    .split(":")
    .map((segment) => segment.trim())
    .filter(Boolean)
}

export function mapImportedAccountType(value: string): AccountType {
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

export function inferAccountTypeFromPath(fullPath: string, fallback: AccountType) {
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

export function buildExistingAccountPathLookup(accounts: Account[]) {
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

export function parseCsvRows(source: string) {
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

export function parseGnuCashAccountCsv(
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

export function buildImportedAccountTree(drafts: ImportedAccountDraft[]) {
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

export function normalizeExportedAccountType(accountType: Account["accountType"]): AccountType {
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

export function buildAccountHierarchyExport(accounts: Account[]): ExportedAccountHierarchy {
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

export function parseExportedAccountHierarchy(
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
