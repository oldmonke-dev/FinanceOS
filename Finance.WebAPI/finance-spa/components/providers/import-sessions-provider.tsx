"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  addImportSessionToLedger,
  createImportSession,
  deleteImportSessionRows,
  deleteImportSession,
  getImportSessions,
  reapplyImportSessionLearning,
  revertImportSessionLearning,
  updateImportSessionTitle,
  updateImportSessionSourceAccount,
  updateImportSessionRowDestinationAccount,
} from "@/lib/import-sessions"
import { type AddImportSessionToLedgerResult } from "@/models/import-session-ledger"
import {
  type CreateImportSessionInput,
  type ImportSession,
} from "@/models/import-session"

type ImportSessionsContextValue = {
  sessions: ImportSession[]
  isLoading: boolean
  errorMessage: string | null
  refreshSessions: () => Promise<void>
  createSession: (input: CreateImportSessionInput) => Promise<ImportSession>
  deleteSession: (sessionId: string) => Promise<void>
  saveSession: (sessionId: string) => Promise<void>
  hasUnsavedChanges: (sessionId: string) => boolean
  updateTitle: (sessionId: string, fileName: string | null) => Promise<void>
  updateSourceAccount: (
    sessionId: string,
    sourceAccountId: string | null,
  ) => Promise<void>
  updateRowDestinationAccount: (
    sessionId: string,
    rowId: string,
    destinationAccountId: string | null,
  ) => Promise<void>
  addSessionToLedger: (sessionId: string) => Promise<AddImportSessionToLedgerResult>
  reapplyLearning: (sessionId: string) => Promise<ImportSession>
  revertLearning: (sessionId: string) => Promise<ImportSession>
  deleteRows: (sessionId: string, rowIds: string[]) => Promise<ImportSession>
}

const ImportSessionsContext = createContext<ImportSessionsContextValue | null>(null)
const DRAFT_STORAGE_KEY = "finance.import-session-drafts"

type SessionDraft = {
  fileName: string | null | undefined
  sourceAccountId: string | null | undefined
  destinationAccountIdByRowId: Record<string, string | null>
}

export function ImportSessionsProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<ImportSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, SessionDraft>>({})
  const draftsRef = useRef<Record<string, SessionDraft>>({})

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY)
      if (!stored) {
        return
      }

      const parsed = JSON.parse(stored) as Record<string, SessionDraft>
      if (parsed && typeof parsed === "object") {
        draftsRef.current = parsed
        setDrafts(parsed)
      }
    } catch {}
  }, [])

  useEffect(() => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts))
  }, [drafts])

  async function refreshSessions() {
    setIsLoading(true)

    try {
      const nextSessions = await getImportSessions()
      setSessions(nextSessions)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unknown error while loading import sessions.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshSessions()
  }, [])

  async function createSession(input: CreateImportSessionInput) {
    const createdSession = await createImportSession(input)
    setSessions((current) => [createdSession, ...current])
    setErrorMessage(null)
    return createdSession
  }

  async function deleteSession(sessionId: string) {
    await deleteImportSession(sessionId)

    setSessions((current) => current.filter((session) => session.id !== sessionId))
    setDrafts((current) => {
      const next = { ...current }
      delete next[sessionId]
      draftsRef.current = next
      return next
    })
    setErrorMessage(null)
  }

  function setDraftForSession(
    sessionId: string,
    updater: (current: SessionDraft) => SessionDraft,
  ) {
    setDrafts((current) => {
      const nextDraft = updater(
        current[sessionId] ?? {
          fileName: undefined,
          sourceAccountId: undefined,
          destinationAccountIdByRowId: {},
        },
      )

      const next = {
        ...current,
        [sessionId]: nextDraft,
      }

      draftsRef.current = next
      return next
    })
  }

  async function updateRowDestinationAccount(
    sessionId: string,
    rowId: string,
    destinationAccountId: string | null,
  ) {
    setDraftForSession(sessionId, (current) => ({
      ...current,
      destinationAccountIdByRowId: {
        ...current.destinationAccountIdByRowId,
        [rowId]: destinationAccountId,
      },
    }))
  }

  async function updateTitle(sessionId: string, fileName: string | null) {
    setDraftForSession(sessionId, (current) => ({
      ...current,
      fileName,
    }))
  }

  async function updateSourceAccount(sessionId: string, sourceAccountId: string | null) {
    setDraftForSession(sessionId, (current) => ({
      ...current,
      sourceAccountId,
    }))
  }

  async function saveSession(sessionId: string) {
    const draft = draftsRef.current[sessionId]
    if (!draft) {
      return
    }

    const session = sessions.find((item) => item.id === sessionId)
    if (!session) {
      return
    }

    for (const row of session.rows) {
      const draftedDestinationAccountId = draft.destinationAccountIdByRowId[row.id]

      if (draftedDestinationAccountId !== undefined && draftedDestinationAccountId !== row.destinationAccountId) {
        const updatedRow = await updateImportSessionRowDestinationAccount(
          sessionId,
          row.id,
          draftedDestinationAccountId,
        )

        setSessions((current) =>
          current.map((currentSession) =>
            currentSession.id !== sessionId
              ? currentSession
              : {
                  ...currentSession,
                  rows: currentSession.rows.map((currentRow) =>
                    currentRow.id !== row.id ? currentRow : { ...currentRow, ...updatedRow },
                  ),
                },
          ),
        )
      }
    }

    if (draft.sourceAccountId !== undefined && draft.sourceAccountId !== session.sourceAccountId) {
      const updatedSession = await updateImportSessionSourceAccount(sessionId, draft.sourceAccountId)

      setSessions((current) =>
        current.map((currentSession) => (currentSession.id === sessionId ? updatedSession : currentSession)),
      )
    }

    if (draft.fileName !== undefined && draft.fileName !== session.fileName) {
      const updatedSession = await updateImportSessionTitle(sessionId, draft.fileName)

      setSessions((current) =>
        current.map((currentSession) => (currentSession.id === sessionId ? updatedSession : currentSession)),
      )
    }

    setDrafts((current) => {
      const next = { ...current }
      delete next[sessionId]
      draftsRef.current = next
      return next
    })
    setErrorMessage(null)
  }

  async function addSessionToLedger(sessionId: string) {
    if (hasUnsavedChanges(sessionId)) {
      await saveSession(sessionId)
    }

    const result = await addImportSessionToLedger(sessionId)
    await refreshSessions()
    setErrorMessage(null)
    return result
  }

  async function reapplyLearning(sessionId: string) {
    const updatedSession = await reapplyImportSessionLearning(sessionId)

    setSessions((current) =>
      current.map((session) => (session.id === sessionId ? updatedSession : session)),
    )
    setErrorMessage(null)
    return updatedSession
  }

  async function revertLearning(sessionId: string) {
    const updatedSession = await revertImportSessionLearning(sessionId)

    setSessions((current) =>
      current.map((session) => (session.id === sessionId ? updatedSession : session)),
    )
    setErrorMessage(null)
    return updatedSession
  }

  async function deleteRows(sessionId: string, rowIds: string[]) {
    const updatedSession = await deleteImportSessionRows(sessionId, rowIds)

    setSessions((current) =>
      current.map((session) => (session.id === sessionId ? updatedSession : session)),
    )
    setDrafts((current) => {
      const draft = current[sessionId]
      if (!draft) {
        return current
      }

      const nextDraft = {
        fileName: draft.fileName,
        sourceAccountId: draft.sourceAccountId,
        destinationAccountIdByRowId: { ...draft.destinationAccountIdByRowId },
      }

      for (const rowId of rowIds) {
        delete nextDraft.destinationAccountIdByRowId[rowId]
      }

      const next = {
        ...current,
        [sessionId]: nextDraft,
      }

      draftsRef.current = next
      return next
    })
    setErrorMessage(null)
    return updatedSession
  }

  function hasUnsavedChanges(sessionId: string) {
    const draft = draftsRef.current[sessionId]
    if (!draft) {
      return false
    }

    return (
      draft.fileName !== undefined ||
      draft.sourceAccountId !== undefined ||
      Object.keys(draft.destinationAccountIdByRowId).length > 0
    )
  }

  const value = useMemo(
    () => ({
      sessions: sessions.map((session) => {
        const draft = drafts[session.id]
        if (!draft) {
          return session
        }

        return {
          ...session,
          fileName: draft.fileName !== undefined ? draft.fileName : session.fileName,
          sourceAccountId:
            draft.sourceAccountId !== undefined ? draft.sourceAccountId : session.sourceAccountId,
          sourceAccountName:
            draft.sourceAccountId !== undefined ? null : session.sourceAccountName,
          rows: session.rows.map((row) => ({
            ...row,
            destinationAccountId:
              draft.destinationAccountIdByRowId[row.id] !== undefined
                ? draft.destinationAccountIdByRowId[row.id]
                : row.destinationAccountId,
            destinationAccountError:
              draft.destinationAccountIdByRowId[row.id] !== undefined ? null : row.destinationAccountError,
          })),
        }
      }),
      isLoading,
      errorMessage,
      refreshSessions,
      createSession,
      deleteSession,
      saveSession,
      hasUnsavedChanges,
      updateTitle,
      updateSourceAccount,
      updateRowDestinationAccount,
      addSessionToLedger,
      reapplyLearning,
      revertLearning,
      deleteRows,
    }),
    [
      sessions,
      drafts,
      isLoading,
      errorMessage,
      createSession,
      deleteRows,
      deleteSession,
      addSessionToLedger,
      refreshSessions,
      saveSession,
      updateRowDestinationAccount,
      updateSourceAccount,
      updateTitle,
    ],
  )

  return <ImportSessionsContext.Provider value={value}>{children}</ImportSessionsContext.Provider>
}

export function useImportSessions() {
  const context = useContext(ImportSessionsContext)

  if (!context) {
    throw new Error("useImportSessions must be used within an ImportSessionsProvider.")
  }

  return context
}
