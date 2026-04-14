const { getUserPreferenceMock, updateUserPreferenceMock } = vi.hoisted(() => ({
  getUserPreferenceMock: vi.fn(),
  updateUserPreferenceMock: vi.fn(),
}))

vi.mock("@/lib/user-preferences", () => ({
  getUserPreference: getUserPreferenceMock,
  updateUserPreference: updateUserPreferenceMock,
}))

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import {
  UserPreferencesProvider,
  useUserPreferences,
} from "./user-preferences-provider"

function Consumer() {
  const {
    preference,
    isLoading,
    errorMessage,
    refreshPreference,
    updatePreferences,
    formatNumber,
  } = useUserPreferences()

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="error">{errorMessage ?? ""}</div>
      <div data-testid="grouping">{preference?.numberGroupingStyle ?? "none"}</div>
      <div data-testid="formatted">{formatNumber(1234567.89)}</div>
      <button type="button" onClick={() => void refreshPreference()}>
        Refresh
      </button>
      <button
        type="button"
        onClick={() =>
          void updatePreferences({
            numberGroupingStyle: "international",
            financialYearMode: "american",
            customFinancialYearStartDate: null,
          })
        }
      >
        Update
      </button>
    </div>
  )
}

describe("UserPreferencesProvider", () => {
  beforeEach(() => {
    getUserPreferenceMock.mockReset()
    updateUserPreferenceMock.mockReset()
  })

  it("loads preferences on mount and formats numbers from the selected locale", async () => {
    getUserPreferenceMock.mockResolvedValue({
      userId: "user-1",
      numberGroupingStyle: "indian",
      financialYearMode: "indian",
      customFinancialYearStartDate: null,
      updatedAt: "2026-04-01T00:00:00Z",
    })

    render(
      <UserPreferencesProvider>
        <Consumer />
      </UserPreferencesProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false")
    })

    expect(screen.getByTestId("grouping")).toHaveTextContent("indian")
    expect(screen.getByTestId("formatted")).toHaveTextContent("12,34,567.89")
  })

  it("captures refresh failures and exposes the error message", async () => {
    getUserPreferenceMock.mockRejectedValue(new Error("Preference load failed"))

    render(
      <UserPreferencesProvider>
        <Consumer />
      </UserPreferencesProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false")
    })

    expect(screen.getByTestId("error")).toHaveTextContent("Preference load failed")
  })

  it("updates preferences and switches number formatting", async () => {
    const user = userEvent.setup()

    getUserPreferenceMock.mockResolvedValue({
      userId: "user-1",
      numberGroupingStyle: "indian",
      financialYearMode: "indian",
      customFinancialYearStartDate: null,
      updatedAt: "2026-04-01T00:00:00Z",
    })
    updateUserPreferenceMock.mockResolvedValue({
      userId: "user-1",
      numberGroupingStyle: "international",
      financialYearMode: "american",
      customFinancialYearStartDate: null,
      updatedAt: "2026-04-01T00:00:01Z",
    })

    render(
      <UserPreferencesProvider>
        <Consumer />
      </UserPreferencesProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("grouping")).toHaveTextContent("indian")
    })

    await user.click(screen.getByRole("button", { name: "Update" }))

    await waitFor(() => {
      expect(screen.getByTestId("grouping")).toHaveTextContent("international")
    })

    expect(updateUserPreferenceMock).toHaveBeenCalledWith({
      numberGroupingStyle: "international",
      financialYearMode: "american",
      customFinancialYearStartDate: null,
    })
    expect(screen.getByTestId("formatted")).toHaveTextContent("1,234,567.89")
  })
})
