const { authFetchMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  authFetch: authFetchMock,
}))

import {
  addImportSessionToLedger,
  createImportSession,
  deleteImportSession,
  deleteImportSessionRows,
  getImportSessions,
  reapplyImportSessionLearning,
  updateImportSessionRowDestinationAccount,
} from "./import-sessions"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  })
}

describe("import sessions client", () => {
  beforeEach(() => {
    authFetchMock.mockReset()
  })

  it("normalizes import sessions and rows from API payloads", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse([
        {
          Id: "session-1",
          CreatedAt: "2026-04-01T00:00:00Z",
          UserId: "user-1",
          CreatedByUserName: "Finance User",
          FileName: "statement.csv",
          SourceAccountId: "source-1",
          SourceAccountName: "Bank",
          Label: "user_imports",
          IsDeletable: true,
          Strategy: "bayesian_statistics",
          IsArchived: false,
          Status: "Active",
          ColumnMappings: {
            0: "date",
            1: "description",
          },
          Rows: [
            {
              Id: "row-1",
              RowIndex: 2,
              Values: ["2026-03-31", "Coffee"],
              DestinationAccountId: "dest-1",
              DestinationAccountError: null,
              MappingSource: "learning",
              LearningConfidenceScore: 0.873,
              AddedToLedgerAt: null,
              PostedTransactionId: "txn-1",
              ProjectBalance: 42,
            },
          ],
        },
      ]),
    )

    const sessions = await getImportSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toEqual({
      id: "session-1",
      createdAt: "2026-04-01T00:00:00Z",
      createdByUserId: "user-1",
      createdByUserName: "Finance User",
      fileName: "statement.csv",
      sourceAccountId: "source-1",
      sourceAccountName: "Bank",
      label: "user_imports",
      isDeletable: true,
      strategy: "bayesian_statistics",
      isArchived: false,
      status: "Active",
      columnMappings: {
        0: "date",
        1: "description",
      },
      rows: [
        {
          id: "row-1",
          rowIndex: 2,
          values: ["2026-03-31", "Coffee"],
          destinationAccountId: "dest-1",
          destinationAccountError: null,
          mappingSource: "learning",
          learningConfidenceScore: 0.873,
          addedToLedgerAt: null,
          postedTransactionId: "txn-1",
          projectBalance: 42,
        },
      ],
    })
  })

  it("throws when the import sessions response is not an array", async () => {
    authFetchMock.mockResolvedValue(jsonResponse({ invalid: true }))

    await expect(getImportSessions()).rejects.toThrow("Import sessions response was not an array")
  })

  it("creates an import session and sends JSON", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        id: "session-created",
        createdAt: "2026-04-01T00:00:00Z",
        userId: "user-1",
        createdByUserName: "Finance User",
        fileName: null,
        sourceAccountId: null,
        sourceAccountName: null,
        label: "user_imports",
        isDeletable: true,
        strategy: "bayesian_statistics",
        isArchived: false,
        status: "Active",
        columnMappings: {},
        rows: [],
      }),
    )

    await createImportSession({
      fileName: null,
      sourceAccountId: null,
      columnMappings: {},
      rows: [],
    })

    expect(authFetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/ImportSessions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    )
  })

  it("normalizes add-to-ledger results", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        SessionId: "session-1",
        CreatedTransactionCount: 3,
        SkippedRowCount: 1,
        TransactionIds: ["txn-1", "txn-2", "txn-3"],
        SessionArchived: true,
        SessionStatus: "Done",
      }),
    )

    const result = await addImportSessionToLedger("session-1")

    expect(result).toEqual({
      sessionId: "session-1",
      createdTransactionCount: 3,
      skippedRowCount: 1,
      transactionIds: ["txn-1", "txn-2", "txn-3"],
      sessionArchived: true,
      sessionStatus: "Done",
    })
  })

  it("normalizes a patched row destination response", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        Id: "row-2",
        RowIndex: 4,
        Values: ["2026-03-30", "Tea"],
        DestinationAccountId: null,
        DestinationAccountError: "Needs review",
        MappingSource: "none",
        LearningConfidenceScore: null,
        AddedToLedgerAt: null,
        PostedTransactionId: null,
        ProjectBalance: 0,
      }),
    )

    const row = await updateImportSessionRowDestinationAccount("session-1", "row-2", null)

    expect(row.destinationAccountError).toBe("Needs review")
    expect(row.learningConfidenceScore).toBeNull()
    expect(authFetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/ImportSessions/session-1/rows/row-2/destination-account",
      expect.objectContaining({
        method: "PATCH",
      }),
    )
  })

  it("surfaces API messages for delete failures", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(
        {
          message: "Session is locked.",
        },
        {
          status: 400,
          statusText: "Bad Request",
        },
      ),
    )

    await expect(deleteImportSession("session-locked")).rejects.toThrow("Session is locked.")
  })

  it("calls the learning reapply endpoint", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        id: "session-1",
        createdAt: "2026-04-01T00:00:00Z",
        userId: "user-1",
        createdByUserName: "Finance User",
        fileName: null,
        sourceAccountId: null,
        sourceAccountName: null,
        label: "user_imports",
        isDeletable: true,
        strategy: "bayesian_statistics",
        isArchived: false,
        status: "Active",
        columnMappings: {},
        rows: [],
      }),
    )

    await reapplyImportSessionLearning("session-1")

    expect(authFetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/ImportSessions/session-1/learning/reapply",
      expect.objectContaining({
        method: "POST",
      }),
    )
  })

  it("sends row ids when deleting import session rows", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        id: "session-1",
        createdAt: "2026-04-01T00:00:00Z",
        userId: "user-1",
        createdByUserName: "Finance User",
        fileName: null,
        sourceAccountId: null,
        sourceAccountName: null,
        label: "user_imports",
        isDeletable: true,
        strategy: "bayesian_statistics",
        isArchived: false,
        status: "Active",
        columnMappings: {},
        rows: [],
      }),
    )

    await deleteImportSessionRows("session-1", ["row-1", "row-2"])

    expect(authFetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/ImportSessions/session-1/rows",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ rowIds: ["row-1", "row-2"] }),
      }),
    )
  })
})
