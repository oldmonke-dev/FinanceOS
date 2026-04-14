const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: useAuthMock,
}))

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { Account } from "@/models/account"

import { AccountSearchSelect } from "./account-search-select"

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

describe("AccountSearchSelect", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: null,
    })
  })

  it("opens, filters, and selects an account", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const accounts = [
      createAccount({ id: "1", name: "Cash" }),
      createAccount({ id: "2", name: "Coffee Expense" }),
    ]

    render(
      <AccountSearchSelect
        accounts={accounts}
        value={null}
        onValueChange={onValueChange}
      />,
    )

    await user.click(screen.getByRole("button", { name: /select account/i }))
    await user.type(screen.getByPlaceholderText("Search account"), "coffee")

    expect(screen.getByRole("button", { name: /coffee expense/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^cash$/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /coffee expense/i }))

    expect(onValueChange).toHaveBeenCalledWith("2")
  })

  it("allows clearing the selection when empty is enabled", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const accounts = [createAccount({ id: "1", name: "Cash" })]

    render(
      <AccountSearchSelect
        accounts={accounts}
        value={"1"}
        onValueChange={onValueChange}
        allowEmpty
      />,
    )

    await user.click(screen.getByRole("button", { name: /cash/i }))
    await user.click(screen.getByRole("button", { name: /unassigned/i }))

    expect(onValueChange).toHaveBeenCalledWith(null)
  })

  it("shows owner details for admins in the popup", async () => {
    const user = userEvent.setup()
    useAuthMock.mockReturnValue({
      user: {
        isAdmin: true,
      },
    })

    const accounts = [
      createAccount({
        id: "1",
        name: "Cash",
        ownerUserId: "user-1",
        ownerDisplayName: "Finance User",
      }),
    ]

    render(
      <AccountSearchSelect
        accounts={accounts}
        value={null}
        onValueChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole("button", { name: /select account/i }))

    await waitFor(() => {
      expect(screen.getByText("Finance User")).toBeInTheDocument()
    })
  })
})
