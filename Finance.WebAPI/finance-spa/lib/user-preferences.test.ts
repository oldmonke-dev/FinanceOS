const { authFetchMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  authFetch: authFetchMock,
}))

import { getUserPreference, updateUserPreference } from "./user-preferences"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  })
}

describe("user-preferences client", () => {
  beforeEach(() => {
    authFetchMock.mockReset()
  })

  it("normalizes fetched user preferences", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        UserId: "user-1",
        NumberGroupingStyle: "indian",
        FinancialYearMode: "custom",
        CustomFinancialYearStartDate: "2026-04-01",
        UpdatedAt: "2026-04-01T00:00:00Z",
      }),
    )

    const preference = await getUserPreference()

    expect(preference).toEqual({
      userId: "user-1",
      numberGroupingStyle: "indian",
      financialYearMode: "custom",
      customFinancialYearStartDate: "2026-04-01",
      updatedAt: "2026-04-01T00:00:00Z",
    })
  })

  it("falls back to safe defaults while normalizing unknown values", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        userId: "user-2",
        numberGroupingStyle: "weird",
        financialYearMode: "not-real",
        updatedAt: "2026-04-01T00:00:00Z",
      }),
    )

    const preference = await getUserPreference()

    expect(preference.numberGroupingStyle).toBe("international")
    expect(preference.financialYearMode).toBe("indian")
  })

  it("sends updates as json and normalizes the response", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        userId: "user-1",
        numberGroupingStyle: "international",
        financialYearMode: "american",
        customFinancialYearStartDate: null,
        updatedAt: "2026-04-01T00:00:01Z",
      }),
    )

    const result = await updateUserPreference({
      numberGroupingStyle: "international",
      financialYearMode: "american",
      customFinancialYearStartDate: null,
    })

    expect(authFetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/UserPreferences",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    )
    expect(result.financialYearMode).toBe("american")
  })

  it("surfaces API messages on failure", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(
        {
          message: "Preference update failed.",
        },
        {
          status: 400,
          statusText: "Bad Request",
        },
      ),
    )

    await expect(
      updateUserPreference({
        numberGroupingStyle: "indian",
        financialYearMode: "custom",
        customFinancialYearStartDate: "2026-04-01",
      }),
    ).rejects.toThrow("Preference update failed.")
  })
})
