const { getAccountsMock } = vi.hoisted(() => ({
  getAccountsMock: vi.fn(),
}))

vi.mock("@/lib/accounts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounts")>("@/lib/accounts")

  return {
    ...actual,
    getAccounts: getAccountsMock,
  }
})

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { type Account } from "@/models/account"

import { AccountsProvider, useAccounts } from "./accounts-provider"

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

function Consumer() {
  const { accounts, isLoading, errorMessage, addAccount, updateAccount, refreshAccounts } = useAccounts()

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="error">{errorMessage ?? ""}</div>
      <div data-testid="count">{accounts.length}</div>
      <div data-testid="names">{accounts.map((account) => account.name).join(", ")}</div>
      <button
        type="button"
        onClick={() =>
          addAccount(
            createAccount({
              id: "added-1",
              name: "Added account",
            }),
          )
        }
      >
        Add
      </button>
      <button
        type="button"
        onClick={() =>
          updateAccount(
            createAccount({
              id: "root-1",
              name: "Renamed root",
            }),
          )
        }
      >
        Update
      </button>
      <button type="button" onClick={() => void refreshAccounts()}>
        Refresh
      </button>
    </div>
  )
}

describe("AccountsProvider", () => {
  beforeEach(() => {
    getAccountsMock.mockReset()
  })

  it("loads accounts on mount", async () => {
    getAccountsMock.mockResolvedValue([
      createAccount({ id: "root-1", name: "Root account" }),
    ])

    render(
      <AccountsProvider>
        <Consumer />
      </AccountsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false")
    })

    expect(screen.getByTestId("count")).toHaveTextContent("1")
    expect(screen.getByTestId("names")).toHaveTextContent("Root account")
  })

  it("captures loading errors", async () => {
    getAccountsMock.mockRejectedValue(new Error("Account load failed"))

    render(
      <AccountsProvider>
        <Consumer />
      </AccountsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false")
    })

    expect(screen.getByTestId("error")).toHaveTextContent("Account load failed")
  })

  it("adds unique accounts and updates existing ones", async () => {
    const user = userEvent.setup()

    getAccountsMock.mockResolvedValue([
      createAccount({ id: "root-1", name: "Root account" }),
    ])

    render(
      <AccountsProvider>
        <Consumer />
      </AccountsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("1")
    })

    await user.click(screen.getByRole("button", { name: "Add" }))
    await user.click(screen.getByRole("button", { name: "Add" }))
    await user.click(screen.getByRole("button", { name: "Update" }))

    expect(screen.getByTestId("count")).toHaveTextContent("2")
    expect(screen.getByTestId("names")).toHaveTextContent("Renamed root, Added account")
  })
})
