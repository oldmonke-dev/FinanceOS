const {
  getCurrentUserMock,
  getStoredAuthTokenMock,
  loginRequestMock,
  setStoredAuthTokenMock,
  usePathnameMock,
  useRouterMock,
  confirmNavigationIfNeededMock,
  replaceMock,
  refreshMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  getStoredAuthTokenMock: vi.fn(),
  loginRequestMock: vi.fn(),
  setStoredAuthTokenMock: vi.fn(),
  usePathnameMock: vi.fn(),
  useRouterMock: vi.fn(),
  confirmNavigationIfNeededMock: vi.fn(),
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useRouter: useRouterMock,
}))

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth")

  return {
    ...actual,
    getCurrentUser: getCurrentUserMock,
    getStoredAuthToken: getStoredAuthTokenMock,
    login: loginRequestMock,
    setStoredAuthToken: setStoredAuthTokenMock,
  }
})

vi.mock("@/components/providers/unsaved-changes-provider", () => ({
  useUnsavedChanges: () => ({
    confirmNavigationIfNeeded: confirmNavigationIfNeededMock,
  }),
}))

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import {
  AuthProvider,
  AuthRouteGuard,
  AuthenticatedApp,
  useAuth,
} from "./auth-provider"

function Consumer() {
  const { user, token, isLoading, login, logout } = useAuth()

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="user">{user?.displayName ?? ""}</div>
      <div data-testid="token">{token ?? ""}</div>
      <button type="button" onClick={() => void login("user@example.com", "password")}>
        Login
      </button>
      <button type="button" onClick={() => void logout()}>
        Logout
      </button>
    </div>
  )
}

describe("AuthProvider", () => {
  beforeEach(() => {
    window.localStorage.clear()
    getCurrentUserMock.mockReset()
    getStoredAuthTokenMock.mockReset()
    loginRequestMock.mockReset()
    setStoredAuthTokenMock.mockReset()
    confirmNavigationIfNeededMock.mockReset()
    replaceMock.mockReset()
    refreshMock.mockReset()

    usePathnameMock.mockReturnValue("/accounts")
    useRouterMock.mockReturnValue({
      replace: replaceMock,
      refresh: refreshMock,
      push: vi.fn(),
    })
    confirmNavigationIfNeededMock.mockResolvedValue(true)
  })

  it("renders children once loading completes with no stored token", async () => {
    getStoredAuthTokenMock.mockReturnValue(null)

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false")
    })

    expect(screen.getByTestId("user")).toHaveTextContent("")
  })

  it("restores the session from a stored token", async () => {
    getStoredAuthTokenMock.mockReturnValue("stored-token")
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      displayName: "Finance User",
      isAdmin: false,
      isSuperUser: false,
    })

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("Finance User")
    })

    expect(screen.getByTestId("token")).toHaveTextContent("stored-token")
  })

  it("logs in, stores the token, and redirects home", async () => {
    const user = userEvent.setup()
    getStoredAuthTokenMock.mockReturnValue(null)
    loginRequestMock.mockResolvedValue({
      accessToken: "new-token",
      expiresAt: "2026-04-01T00:00:00Z",
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Finance User",
        isAdmin: true,
        isSuperUser: false,
      },
    })

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false")
    })

    await user.click(screen.getByRole("button", { name: "Login" }))

    await waitFor(() => {
      expect(screen.getByTestId("token")).toHaveTextContent("new-token")
    })

    expect(setStoredAuthTokenMock).toHaveBeenCalledWith("new-token")
    expect(replaceMock).toHaveBeenCalledWith("/")
  })

  it("logs out after confirming navigation", async () => {
    const user = userEvent.setup()
    getStoredAuthTokenMock.mockReturnValue("stored-token")
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      displayName: "Finance User",
      isAdmin: false,
      isSuperUser: false,
    })

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("Finance User")
    })

    await user.click(screen.getByRole("button", { name: "Logout" }))

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("")
    })

    expect(confirmNavigationIfNeededMock).toHaveBeenCalled()
    expect(setStoredAuthTokenMock).toHaveBeenCalledWith(null)
    expect(window.localStorage.getItem("finance.auth.token")).toBeNull()
    expect(replaceMock).toHaveBeenCalledWith("/login")
    expect(refreshMock).toHaveBeenCalled()
  })

  it("clears session and redirects when auth expires", async () => {
    getStoredAuthTokenMock.mockReturnValue("stored-token")
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      displayName: "Finance User",
      isAdmin: false,
      isSuperUser: false,
    })

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("Finance User")
    })

    window.dispatchEvent(new CustomEvent("finance-auth-expired"))

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("")
    })

    expect(setStoredAuthTokenMock).toHaveBeenCalledWith(null)
    expect(replaceMock).toHaveBeenCalledWith("/login")
  })
})

describe("AuthRouteGuard", () => {
  beforeEach(() => {
    replaceMock.mockReset()
    useRouterMock.mockReturnValue({
      replace: replaceMock,
      refresh: refreshMock,
      push: vi.fn(),
    })
  })

  it("redirects unauthenticated users away from protected routes", async () => {
    usePathnameMock.mockReturnValue("/reports")
    getStoredAuthTokenMock.mockReturnValue(null)

    render(
      <AuthProvider>
        <AuthRouteGuard />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login")
    })
  })

  it("redirects authenticated users away from login", async () => {
    usePathnameMock.mockReturnValue("/login")
    getStoredAuthTokenMock.mockReturnValue("stored-token")
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      displayName: "Finance User",
      isAdmin: false,
      isSuperUser: false,
    })

    render(
      <AuthProvider>
        <AuthRouteGuard />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/")
    })
  })
})

describe("AuthenticatedApp", () => {
  beforeEach(() => {
    useRouterMock.mockReturnValue({
      replace: replaceMock,
      refresh: refreshMock,
      push: vi.fn(),
    })
  })

  it("renders children on the login route when there is no user", async () => {
    usePathnameMock.mockReturnValue("/login")
    getStoredAuthTokenMock.mockReturnValue(null)

    render(
      <AuthProvider>
        <AuthenticatedApp>
          <div>Login content</div>
        </AuthenticatedApp>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("Login content")).toBeInTheDocument()
    })
  })

  it("shows redirecting state on the login route when the user exists", async () => {
    usePathnameMock.mockReturnValue("/login")
    getStoredAuthTokenMock.mockReturnValue("stored-token")
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      displayName: "Finance User",
      isAdmin: false,
      isSuperUser: false,
    })

    render(
      <AuthProvider>
        <AuthenticatedApp>
          <div>Login content</div>
        </AuthenticatedApp>
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText("Redirecting...")).toBeInTheDocument()
    })
  })
})
