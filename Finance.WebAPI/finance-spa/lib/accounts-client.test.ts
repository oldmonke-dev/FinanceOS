const { authFetchMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  authFetch: authFetchMock,
}))

import {
  batchUpdateAccounts,
  createAccount,
  deleteAccount,
  getAccountPermissions,
  getAccounts,
  renameAccount,
  updateAccountOwner,
  updateAccountPermissions,
} from "./accounts"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  })
}

describe("accounts client", () => {
  beforeEach(() => {
    authFetchMock.mockReset()
  })

  it("normalizes account lists", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse([
        {
          Id: "acc-1",
          Name: "Cash",
          AccountType: "Asset",
          ParentAccountId: null,
          OpeningBalance: 100,
          IsCore: false,
          IsGloballyShared: true,
          OwnerUserId: null,
          OwnerDisplayName: null,
          OwnerEmail: null,
          ReportingMode: "Included",
          CurrentUserPermissions: {
            CanView: true,
            CanPost: true,
            CanEditTransaction: false,
            CanDeleteTransaction: false,
            CanManageAccess: false,
            CanChangeOwner: false,
            IsOwner: false,
          },
        },
      ]),
    )

    const accounts = await getAccounts()

    expect(accounts).toHaveLength(1)
    expect(accounts[0].name).toBe("Cash")
    expect(accounts[0].currentUserPermissions.canPost).toBe(true)
  })

  it("surfaces non-array account responses", async () => {
    authFetchMock.mockResolvedValue(jsonResponse({ invalid: true }))

    await expect(getAccounts()).rejects.toThrow("Accounts response was not an array")
  })

  it("creates, renames, and updates account owner", async () => {
    authFetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: "acc-1",
          name: "Cash",
          accountType: "Asset",
          parentAccountId: null,
          openingBalance: 100,
          isCore: false,
          isGloballyShared: false,
          ownerUserId: null,
          ownerDisplayName: null,
          ownerEmail: null,
          reportingMode: "Included",
          currentUserPermissions: {},
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "acc-1",
          name: "Cash renamed",
          accountType: "Asset",
          parentAccountId: null,
          openingBalance: 100,
          isCore: false,
          isGloballyShared: false,
          ownerUserId: null,
          ownerDisplayName: null,
          ownerEmail: null,
          reportingMode: "Included",
          currentUserPermissions: {},
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "acc-1",
          name: "Cash renamed",
          accountType: "Asset",
          parentAccountId: null,
          openingBalance: 100,
          isCore: false,
          isGloballyShared: false,
          ownerUserId: "user-1",
          ownerDisplayName: "Finance User",
          ownerEmail: "user@example.com",
          reportingMode: "Included",
          currentUserPermissions: {},
        }),
      )

    const created = await createAccount({
      name: "Cash",
      accountType: 1,
      parentAccountId: null,
      openingBalance: 100,
    })
    const renamed = await renameAccount("acc-1", {
      name: "Cash renamed",
      openingBalance: 100,
      parentAccountId: null,
    })
    const updatedOwner = await updateAccountOwner("acc-1", "user-1")

    expect(created.name).toBe("Cash")
    expect(renamed.name).toBe("Cash renamed")
    expect(updatedOwner.ownerUserId).toBe("user-1")
  })

  it("normalizes delete-account responses", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        DeletedAccountId: "acc-1",
        CreatedImportSessionId: "session-1",
        AffectedTransactionCount: 5,
      }),
    )

    const result = await deleteAccount("acc-1")

    expect(result).toEqual({
      deletedAccountId: "acc-1",
      createdImportSessionId: "session-1",
      affectedTransactionCount: 5,
    })
  })

  it("normalizes account permissions details", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        AccountId: "acc-1",
        AccountName: "Cash",
        OwnerUserId: "user-1",
        OwnerDisplayName: "Finance User",
        OwnerEmail: "user@example.com",
        IsGloballyShared: false,
        ReportingMode: "Included",
        CurrentUserPermissions: {
          CanView: true,
          CanPost: true,
        },
        Entries: [
          {
            UserId: "user-2",
            UserDisplayName: "Viewer",
            UserEmail: "viewer@example.com",
            IsAdmin: false,
            CanView: true,
            CanPost: false,
            CanEditTransaction: false,
            CanDeleteTransaction: false,
            CanManageAccess: false,
          },
        ],
        AvailableUsers: [
          {
            Id: "user-2",
            DisplayName: "Viewer",
            Email: "viewer@example.com",
            IsAdmin: false,
          },
        ],
      }),
    )

    const result = await getAccountPermissions("acc-1")

    expect(result.accountName).toBe("Cash")
    expect(result.entries[0].userDisplayName).toBe("Viewer")
    expect(result.availableUsers[0].email).toBe("viewer@example.com")
  })

  it("updates account permissions by PUT then reloads details", async () => {
    authFetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          accountId: "acc-1",
          accountName: "Cash",
          ownerUserId: null,
          ownerDisplayName: null,
          ownerEmail: null,
          isGloballyShared: false,
          reportingMode: "Included",
          currentUserPermissions: {},
          entries: [],
          availableUsers: [],
        }),
      )

    const result = await updateAccountPermissions("acc-1", {
      ownerUserId: null,
      isGloballyShared: false,
      reportingMode: "Included",
      entries: [],
    })

    expect(authFetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3000/Accounts/acc-1/permissions",
      expect.objectContaining({
        method: "PUT",
      }),
    )
    expect(result.accountId).toBe("acc-1")
  })

  it("normalizes batch-update results and surfaces API errors", async () => {
    authFetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            Id: "acc-1",
            Name: "Cash",
            UpdatedNodeCount: 2,
            AccountTypeChanged: true,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            message: "Batch update failed.",
          },
          {
            status: 400,
            statusText: "Bad Request",
          },
        ),
      )

    const result = await batchUpdateAccounts({
      accountIds: ["acc-1"],
      applyOwner: false,
      ownerUserId: null,
      applyGlobalSharing: false,
      isGloballyShared: false,
      applyMove: false,
      parentAccountId: null,
    })

    expect(result).toEqual([
      {
        id: "acc-1",
        name: "Cash",
        updatedNodeCount: 2,
        accountTypeChanged: true,
      },
    ])

    await expect(
      batchUpdateAccounts({
        accountIds: ["acc-1"],
        applyOwner: false,
        ownerUserId: null,
        applyGlobalSharing: false,
        isGloballyShared: false,
        applyMove: false,
        parentAccountId: null,
      }),
    ).rejects.toThrow("Batch update failed.")
  })
})
