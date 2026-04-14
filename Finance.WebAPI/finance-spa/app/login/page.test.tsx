const { loginMock, showSnackbarMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  showSnackbarMock: vi.fn(),
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}))

vi.mock("@/components/providers/snackbar-provider", () => ({
  useSnackbar: () => ({
    showSnackbar: showSnackbarMock,
  }),
}))

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import LoginPage from "./page"

function deferredPromise() {
  let resolve!: () => void
  let reject!: (error?: unknown) => void

  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe("LoginPage", () => {
  beforeEach(() => {
    loginMock.mockReset()
    showSnackbarMock.mockReset()
  })

  it("renders the sign-in form", () => {
    render(<LoginPage />)

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  })

  it("submits entered credentials through useAuth", async () => {
    const user = userEvent.setup()
    loginMock.mockResolvedValue(undefined)

    render(<LoginPage />)

    await user.type(screen.getByLabelText("Email"), "user@example.com")
    await user.type(screen.getByLabelText("Password"), "secret")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith("user@example.com", "secret")
    })
  })

  it("shows loading state while submitting", async () => {
    const user = userEvent.setup()
    const deferred = deferredPromise()
    loginMock.mockReturnValue(deferred.promise)

    render(<LoginPage />)

    await user.type(screen.getByLabelText("Email"), "user@example.com")
    await user.type(screen.getByLabelText("Password"), "secret")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(screen.getByRole("button", { name: "Signing in..." })).toBeDisabled()

    deferred.resolve()

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })
  })

  it("shows snackbar error feedback and restores the button after login failure", async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(new Error("Invalid credentials"))

    render(<LoginPage />)

    await user.type(screen.getByLabelText("Email"), "user@example.com")
    await user.type(screen.getByLabelText("Password"), "wrong")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => {
      expect(showSnackbarMock).toHaveBeenCalledWith({
        message: "Invalid credentials",
        tone: "error",
      })
    })

    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled()
  })
})
