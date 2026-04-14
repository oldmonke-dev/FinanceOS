import type { Account } from "@/models/account"

import {
  buildAccountHierarchyExport,
  buildExistingAccountPathLookup,
  buildImportedAccountTree,
  getImportedPathSegments,
  inferAccountTypeFromPath,
  mapImportedAccountType,
  normalizeExportedAccountType,
  normalizeImportedFullPath,
  parseCsvRows,
  parseExportedAccountHierarchy,
  parseGnuCashAccountCsv,
} from "./account-tree-import"

function createAccount(overrides: Partial<Account>): Account {
  return {
    id: overrides.id ?? "account-id",
    name: overrides.name ?? "Account",
    accountNumber: overrides.accountNumber ?? null,
    description: overrides.description ?? null,
    accountType: overrides.accountType ?? "Asset",
    parentAccountId: overrides.parentAccountId ?? null,
    openingBalance: overrides.openingBalance ?? 0,
    isCore: overrides.isCore ?? false,
    isGloballyShared: overrides.isGloballyShared ?? false,
    ownerUserId: overrides.ownerUserId ?? null,
    ownerDisplayName: overrides.ownerDisplayName ?? null,
    ownerEmail: overrides.ownerEmail ?? null,
    reportingMode: overrides.reportingMode ?? "Included",
    currentUserPermissions:
      overrides.currentUserPermissions ?? {
        canView: true,
        canPost: true,
        canEditTransaction: true,
        canDeleteTransaction: true,
        canManageAccess: true,
        canChangeOwner: true,
        isOwner: true,
      },
  }
}

describe("account-tree import helpers", () => {
  it("normalizes and splits imported full paths", () => {
    expect(normalizeImportedFullPath(" Assets : Bank : Checking ")).toBe("Assets:Bank:Checking")
    expect(getImportedPathSegments(" Assets : Bank : Checking ")).toEqual(["Assets", "Bank", "Checking"])
  })

  it("maps and infers account types", () => {
    expect(mapImportedAccountType("BANK")).toBe(1)
    expect(mapImportedAccountType("credit")).toBe(2)
    expect(inferAccountTypeFromPath("Expenses:Food", 1)).toBe(5)
    expect(inferAccountTypeFromPath("Unknown:Leaf", 3)).toBe(3)
    expect(normalizeExportedAccountType("Income")).toBe(4)
  })

  it("parses csv rows with quoted commas", () => {
    expect(parseCsvRows('Type,Full Account Name\nBANK,"Assets:Bank, Joint"')).toEqual([
      ["Type", "Full Account Name"],
      ["BANK", "Assets:Bank, Joint"],
    ])
  })

  it("parses gnucash account csv and ignores hidden rows", () => {
    const lookup = new Map<string, Account>([["assets:bank".toLowerCase(), createAccount({ id: "1", name: "Bank" })]])
    const csv = [
      "Type,Full Account Name,Hidden",
      "BANK,Assets:Bank,F",
      "EXPENSE,Expenses:Coffee,T",
    ].join("\n")

    const drafts = parseGnuCashAccountCsv(csv, lookup)

    expect(drafts).toHaveLength(1)
    expect(drafts[0].fullPath).toBe("Assets:Bank")
    expect(drafts[0].isExisting).toBe(true)
  })

  it("builds path lookup and imported tree hierarchy", () => {
    const accounts = [
      createAccount({ id: "root", name: "Assets" }),
      createAccount({ id: "child", name: "Bank", parentAccountId: "root" }),
    ]

    const lookup = buildExistingAccountPathLookup(accounts)
    expect(lookup.has("assets:bank")).toBe(true)

    const tree = buildImportedAccountTree([
      { id: "1", fullPath: "Assets:Bank:Checking", accountType: 1, include: true, isExisting: false },
      { id: "2", fullPath: "Assets:Cash", accountType: 1, include: true, isExisting: false },
    ])

    expect(tree.map((node) => node.name)).toEqual(["Assets"])
    expect(tree[0].children.map((node) => node.name)).toEqual(["Bank", "Cash"])
  })

  it("exports and re-parses account hierarchy json", () => {
    const accounts = [
      createAccount({ id: "root", name: "Assets" }),
      createAccount({ id: "child", name: "Bank", parentAccountId: "root", accountNumber: "001" }),
    ]

    const exported = buildAccountHierarchyExport(accounts)
    const drafts = parseExportedAccountHierarchy(JSON.stringify(exported), new Map())

    expect(exported.format).toBe("finance.account_hierarchy")
    expect(drafts.map((draft) => draft.fullPath)).toEqual(["Assets", "Assets:Bank"])
    expect(drafts[1].accountNumber).toBe("001")
  })
})
