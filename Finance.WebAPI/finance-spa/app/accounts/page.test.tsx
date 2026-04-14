import { render, screen } from "@testing-library/react"

import AccountsPage from "./page"

vi.mock("@/components/account-tree", () => ({
  AccountTree: function MockAccountTree() {
    return <div data-testid="account-tree">Mock account tree</div>
  },
}))

vi.mock("@/components/app-shell", () => ({
  AppShell: function MockAppShell({
    title,
    subtitle,
    children,
  }: {
    title: string
    subtitle: string
    children: React.ReactNode
  }) {
    return (
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div>{children}</div>
      </div>
    )
  },
}))

describe("AccountsPage", () => {
  it("renders the accounts page shell content", () => {
    render(<AccountsPage />)

    expect(screen.getByRole("heading", { name: "Account tree" })).toBeInTheDocument()
    expect(
      screen.getByText("Shared account state backed by the accounts API"),
    ).toBeInTheDocument()
    expect(screen.getByTestId("account-tree")).toBeInTheDocument()
  })
})
