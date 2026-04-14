import type { Account } from "@/models/account"

import {
  buildAccountPathLookup,
  buildAccountTree,
  formatAccountReportingMode,
  formatAccountType,
  getAccountOwnerLabel,
} from "./accounts"

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

describe("accounts helpers", () => {
  it("builds a sorted account tree from parent-child relationships", () => {
    const accounts = [
      createAccount({ id: "child-b", name: "Zeta child", parentAccountId: "root-1" }),
      createAccount({ id: "root-2", name: "Other root" }),
      createAccount({ id: "root-1", name: "Main root" }),
      createAccount({ id: "child-a", name: "Alpha child", parentAccountId: "root-1" }),
    ]

    const tree = buildAccountTree(accounts)

    expect(tree.map((node) => node.name)).toEqual(["Main root", "Other root"])
    expect(tree[0].children.map((node) => node.name)).toEqual(["Alpha child", "Zeta child"])
  })

  it("builds full account paths", () => {
    const accounts = [
      createAccount({ id: "root", name: "Assets" }),
      createAccount({ id: "bank", name: "Bank", parentAccountId: "root" }),
      createAccount({ id: "checking", name: "Checking", parentAccountId: "bank" }),
    ]

    const pathLookup = buildAccountPathLookup(accounts)

    expect(pathLookup.get("root")).toBe("Assets")
    expect(pathLookup.get("bank")).toBe("Assets / Bank")
    expect(pathLookup.get("checking")).toBe("Assets / Bank / Checking")
  })

  it("prefers core and sharing owner labels before user labels", () => {
    expect(getAccountOwnerLabel(createAccount({ isCore: true }))).toBe("Core Account")
    expect(getAccountOwnerLabel(createAccount({ isGloballyShared: true }))).toBe("Globally Shared")
    expect(getAccountOwnerLabel(createAccount({ ownerUserId: null }))).toBe("Globally Shared")
  })

  it("uses display name, then email, then user id for owner labels", () => {
    expect(
      getAccountOwnerLabel(
        createAccount({
          ownerUserId: "user-1",
          ownerDisplayName: "Priya",
          ownerEmail: "priya@example.com",
        }),
      ),
    ).toBe("Priya")

    expect(
      getAccountOwnerLabel(
        createAccount({
          ownerUserId: "user-1",
          ownerDisplayName: " ",
          ownerEmail: "owner@example.com",
        }),
      ),
    ).toBe("owner@example.com")

    expect(
      getAccountOwnerLabel(
        createAccount({
          ownerUserId: "user-1",
          ownerDisplayName: " ",
          ownerEmail: " ",
        }),
      ),
    ).toBe("user-1")
  })

  it("formats reporting modes and account types", () => {
    expect(formatAccountReportingMode("Included")).toBe("Included")
    expect(formatAccountReportingMode("OperationalOnly")).toBe("Operational only")
    expect(formatAccountReportingMode("Excluded")).toBe("Excluded")
    expect(formatAccountType(1)).toBe("Asset")
    expect(formatAccountType(5)).toBe("Expense")
    expect(formatAccountType(99)).toBe("Type 99")
  })
})
