import {
  AUTH_TOKEN_STORAGE_KEY,
  authFetch,
  getCurrentUser,
  getStoredAuthToken,
  login,
  setStoredAuthToken,
} from "./auth"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  })
}

describe("auth helpers", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it("stores and clears auth tokens", () => {
    expect(getStoredAuthToken()).toBeNull()

    setStoredAuthToken("token-123")
    expect(getStoredAuthToken()).toBe("token-123")

    setStoredAuthToken(null)
    expect(getStoredAuthToken()).toBeNull()
  })

  it("logs in and normalizes the user payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accessToken: "access-token",
        expiresAt: "2026-04-01T00:00:00Z",
        user: {
          Id: "user-1",
          Email: "user@example.com",
          DisplayName: "Finance User",
          IsAdmin: true,
          IsSuperUser: false,
        },
      }),
    )

    const result = await login("user@example.com", "password")

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/Auth/login",
      expect.objectContaining({
        method: "POST",
      }),
    )
    expect(result).toEqual({
      accessToken: "access-token",
      expiresAt: "2026-04-01T00:00:00Z",
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Finance User",
        isAdmin: true,
        isSuperUser: false,
      },
    })
  })

  it("loads the current user with a bearer token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        id: "user-2",
        email: "viewer@example.com",
        displayName: "Viewer",
        isAdmin: false,
        isSuperUser: true,
      }),
    )

    const user = await getCurrentUser("abc-token")

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/Auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer abc-token",
        }),
      }),
    )
    expect(user.displayName).toBe("Viewer")
    expect(user.isSuperUser).toBe(true)
  })

  it("adds auth headers and clears the token on 401", async () => {
    setStoredAuthToken("expired-token")

    const expiredHandler = vi.fn()
    window.addEventListener("finance-auth-expired", expiredHandler)

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 401,
      }),
    )

    await authFetch("http://localhost:3000/secure", {
      headers: {
        Accept: "application/json",
      },
    })

    expect(getStoredAuthToken()).toBeNull()
    expect(expiredHandler).toHaveBeenCalledTimes(1)

    window.removeEventListener("finance-auth-expired", expiredHandler)
  })
})
