const {
  addImportSessionToLedgerMock,
  createImportSessionMock,
  deleteImportSessionMock,
  deleteImportSessionRowsMock,
  getImportSessionsMock,
  reapplyImportSessionLearningMock,
  revertImportSessionLearningMock,
  updateImportSessionRowDestinationAccountMock,
  updateImportSessionSourceAccountMock,
  updateImportSessionTitleMock,
} = vi.hoisted(() => ({
  addImportSessionToLedgerMock: vi.fn(),
  createImportSessionMock: vi.fn(),
  deleteImportSessionMock: vi.fn(),
  deleteImportSessionRowsMock: vi.fn(),
  getImportSessionsMock: vi.fn(),
  reapplyImportSessionLearningMock: vi.fn(),
  revertImportSessionLearningMock: vi.fn(),
  updateImportSessionRowDestinationAccountMock: vi.fn(),
  updateImportSessionSourceAccountMock: vi.fn(),
  updateImportSessionTitleMock: vi.fn(),
}))

vi.mock("@/lib/import-sessions", () => ({
  addImportSessionToLedger: addImportSessionToLedgerMock,
  createImportSession: createImportSessionMock,
  deleteImportSession: deleteImportSessionMock,
  deleteImportSessionRows: deleteImportSessionRowsMock,
  deleteImportSession: deleteImportSessionMock,
  getImportSessions: getImportSessionsMock,
  reapplyImportSessionLearning: reapplyImportSessionLearningMock,
  revertImportSessionLearning: revertImportSessionLearningMock,
  updateImportSessionRowDestinationAccount: updateImportSessionRowDestinationAccountMock,
  updateImportSessionSourceAccount: updateImportSessionSourceAccountMock,
  updateImportSessionTitle: updateImportSessionTitleMock,
}))

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { type ImportSession } from "@/models/import-session"

import { ImportSessionsProvider, useImportSessions } from "./import-sessions-provider"

function createSession(overrides: Partial<ImportSession>): ImportSession {
  return {
    id: overrides.id ?? "session-1",
    createdAt: overrides.createdAt ?? "2026-04-01T00:00:00Z",
    createdByUserId: overrides.createdByUserId ?? "user-1",
    createdByUserName: overrides.createdByUserName ?? "Finance User",
    fileName: overrides.fileName ?? "statement.csv",
    sourceAccountId: overrides.sourceAccountId ?? "source-1",
    sourceAccountName: overrides.sourceAccountName ?? "Bank",
    label: overrides.label ?? "user_imports",
    isDeletable: overrides.isDeletable ?? true,
    strategy: overrides.strategy ?? "bayesian_statistics",
    isArchived: overrides.isArchived ?? false,
    status: overrides.status ?? "Active",
    columnMappings: overrides.columnMappings ?? {},
    rows: overrides.rows ?? [
      {
        id: "row-1",
        rowIndex: 0,
        values: ["2026-03-31", "Coffee"],
        destinationAccountId: "dest-1",
        destinationAccountError: "Old error",
        mappingSource: "none",
        learningConfidenceScore: null,
        addedToLedgerAt: null,
        postedTransactionId: null,
        projectBalance: 0,
      },
    ],
  }
}

function Consumer() {
  const {
    sessions,
    isLoading,
    errorMessage,
    hasUnsavedChanges,
    updateTitle,
    updateSourceAccount,
    updateRowDestinationAccount,
    saveSession,
    addSessionToLedger,
  } = useImportSessions()

  const session = sessions[0]
  const row = session?.rows[0]

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="error">{errorMessage ?? ""}</div>
      <div data-testid="count">{sessions.length}</div>
      <div data-testid="title">{session?.fileName ?? ""}</div>
      <div data-testid="source">{session?.sourceAccountId ?? ""}</div>
      <div data-testid="destination">{row?.destinationAccountId ?? ""}</div>
      <div data-testid="destination-error">{row?.destinationAccountError ?? ""}</div>
      <div data-testid="unsaved">{session ? String(hasUnsavedChanges(session.id)) : "false"}</div>
      <button type="button" onClick={() => void updateTitle("session-1", "draft-title.csv")}>
        Draft title
      </button>
      <button type="button" onClick={() => void updateSourceAccount("session-1", "source-2")}>
        Draft source
      </button>
      <button type="button" onClick={() => void updateRowDestinationAccount("session-1", "row-1", "dest-2")}>
        Draft destination
      </button>
      <button type="button" onClick={() => void saveSession("session-1")}>
        Save
      </button>
      <button type="button" onClick={() => void addSessionToLedger("session-1")}>
        Add to ledger
      </button>
    </div>
  )
}

describe("ImportSessionsProvider", () => {
  beforeEach(() => {
    window.localStorage.clear()
    addImportSessionToLedgerMock.mockReset()
    createImportSessionMock.mockReset()
    deleteImportSessionMock.mockReset()
    deleteImportSessionRowsMock.mockReset()
    getImportSessionsMock.mockReset()
    reapplyImportSessionLearningMock.mockReset()
    revertImportSessionLearningMock.mockReset()
    updateImportSessionRowDestinationAccountMock.mockReset()
    updateImportSessionSourceAccountMock.mockReset()
    updateImportSessionTitleMock.mockReset()
  })

  it("loads sessions on mount", async () => {
    getImportSessionsMock.mockResolvedValue([createSession({})])

    render(
      <ImportSessionsProvider>
        <Consumer />
      </ImportSessionsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false")
    })

    expect(screen.getByTestId("count")).toHaveTextContent("1")
    expect(screen.getByTestId("title")).toHaveTextContent("statement.csv")
  })

  it("overlays draft changes and clears row errors while editing", async () => {
    const user = userEvent.setup()
    getImportSessionsMock.mockResolvedValue([createSession({})])

    render(
      <ImportSessionsProvider>
        <Consumer />
      </ImportSessionsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("1")
    })

    await user.click(screen.getByRole("button", { name: "Draft title" }))
    await user.click(screen.getByRole("button", { name: "Draft source" }))
    await user.click(screen.getByRole("button", { name: "Draft destination" }))

    expect(screen.getByTestId("title")).toHaveTextContent("draft-title.csv")
    expect(screen.getByTestId("source")).toHaveTextContent("source-2")
    expect(screen.getByTestId("destination")).toHaveTextContent("dest-2")
    expect(screen.getByTestId("destination-error")).toHaveTextContent("")
    expect(screen.getByTestId("unsaved")).toHaveTextContent("true")
  })

  it("saves drafted row, source, and title changes in sequence", async () => {
    const user = userEvent.setup()
    getImportSessionsMock.mockResolvedValue([createSession({})])
    updateImportSessionRowDestinationAccountMock.mockResolvedValue({
      id: "row-1",
      rowIndex: 0,
      values: ["2026-03-31", "Coffee"],
      destinationAccountId: "dest-2",
      destinationAccountError: null,
      mappingSource: "manual",
      learningConfidenceScore: null,
      addedToLedgerAt: null,
      postedTransactionId: null,
      projectBalance: 0,
    })
    updateImportSessionSourceAccountMock.mockResolvedValue(
      createSession({
        sourceAccountId: "source-2",
      }),
    )
    updateImportSessionTitleMock.mockResolvedValue(
      createSession({
        fileName: "draft-title.csv",
        sourceAccountId: "source-2",
        rows: [
          {
            id: "row-1",
            rowIndex: 0,
            values: ["2026-03-31", "Coffee"],
            destinationAccountId: "dest-2",
            destinationAccountError: null,
            mappingSource: "manual",
            learningConfidenceScore: null,
            addedToLedgerAt: null,
            postedTransactionId: null,
            projectBalance: 0,
          },
        ],
      }),
    )

    render(
      <ImportSessionsProvider>
        <Consumer />
      </ImportSessionsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("1")
    })

    await user.click(screen.getByRole("button", { name: "Draft title" }))
    await user.click(screen.getByRole("button", { name: "Draft source" }))
    await user.click(screen.getByRole("button", { name: "Draft destination" }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(screen.getByTestId("unsaved")).toHaveTextContent("false")
    })

    expect(updateImportSessionRowDestinationAccountMock).toHaveBeenCalledWith("session-1", "row-1", "dest-2")
    expect(updateImportSessionSourceAccountMock).toHaveBeenCalledWith("session-1", "source-2")
    expect(updateImportSessionTitleMock).toHaveBeenCalledWith("session-1", "draft-title.csv")
    expect(screen.getByTestId("title")).toHaveTextContent("draft-title.csv")
    expect(screen.getByTestId("source")).toHaveTextContent("source-2")
    expect(screen.getByTestId("destination")).toHaveTextContent("dest-2")
  })

  it("saves unsaved changes before adding a session to the ledger and refreshes", async () => {
    const user = userEvent.setup()
    getImportSessionsMock
      .mockResolvedValueOnce([createSession({})])
      .mockResolvedValueOnce([
        createSession({
          isArchived: true,
          status: "Done",
        }),
      ])
    updateImportSessionTitleMock.mockResolvedValue(createSession({ fileName: "draft-title.csv" }))
    addImportSessionToLedgerMock.mockResolvedValue({
      sessionId: "session-1",
      createdTransactionCount: 1,
      skippedRowCount: 0,
      transactionIds: ["txn-1"],
      sessionArchived: true,
      sessionStatus: "Done",
    })

    render(
      <ImportSessionsProvider>
        <Consumer />
      </ImportSessionsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("1")
    })

    await user.click(screen.getByRole("button", { name: "Draft title" }))
    await user.click(screen.getByRole("button", { name: "Add to ledger" }))

    await waitFor(() => {
      expect(addImportSessionToLedgerMock).toHaveBeenCalledWith("session-1")
    })

    expect(updateImportSessionTitleMock).toHaveBeenCalledWith("session-1", "draft-title.csv")
    expect(getImportSessionsMock).toHaveBeenCalledTimes(2)
  })
})
