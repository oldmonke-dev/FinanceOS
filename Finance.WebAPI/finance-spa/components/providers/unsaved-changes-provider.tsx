"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider"

type UnsavedChangesEntry = {
  id: string
  hasUnsavedChanges: boolean
  onSave?: (() => Promise<boolean>) | null
}

type UnsavedChangesContextValue = {
  setEntry: (entry: UnsavedChangesEntry) => void
  removeEntry: (id: string) => void
  confirmNavigationIfNeeded: () => Promise<boolean>
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { confirm } = useConfirmationDialog()
  const [entries, setEntries] = useState<Record<string, UnsavedChangesEntry>>({})

  const hasUnsavedChanges = useMemo(
    () => Object.values(entries).some((entry) => entry.hasUnsavedChanges),
    [entries],
  )

  const getActiveEntry = useCallback(() => {
    return [...Object.values(entries)].reverse().find((entry) => entry.hasUnsavedChanges) ?? null
  }, [entries])

  const confirmNavigationIfNeeded = useCallback(async () => {
    const activeEntry = getActiveEntry()
    if (!activeEntry) {
      return true
    }

    const shouldSave = await confirm({
      title: "Unsaved changes",
      message: "Unsaved changes are there. Do you want to save them before leaving this page?",
      confirmLabel: "Save and leave",
      cancelLabel: "Leave without saving",
    })

    if (!shouldSave) {
      return true
    }

    if (!activeEntry.onSave) {
      return true
    }

    return await activeEntry.onSave()
  }, [confirm, getActiveEntry])

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return
    }

    let isHandlingNavigation = false

    function isInternalNavigation(anchor: HTMLAnchorElement) {
      if (anchor.target && anchor.target !== "_self") {
        return false
      }

      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#")) {
        return false
      }

      const url = new URL(anchor.href, window.location.href)
      return url.origin === window.location.origin && url.href !== window.location.href
    }

    async function handleDocumentClick(event: MouseEvent) {
      if (isHandlingNavigation) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest("a")
      if (!(anchor instanceof HTMLAnchorElement) || !isInternalNavigation(anchor)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const nextUrl = new URL(anchor.href, window.location.href)
      isHandlingNavigation = true

      const shouldContinue = await confirmNavigationIfNeeded()
      if (!shouldContinue) {
        isHandlingNavigation = false
        return
      }

      router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
    }

    document.addEventListener("click", handleDocumentClick, true)

    return () => {
      document.removeEventListener("click", handleDocumentClick, true)
    }
  }, [confirmNavigationIfNeeded, hasUnsavedChanges, router])

  const setEntry = useCallback((entry: UnsavedChangesEntry) => {
    setEntries((current) => {
      const previous = current[entry.id]

      if (
        previous &&
        previous.hasUnsavedChanges === entry.hasUnsavedChanges &&
        previous.onSave === entry.onSave
      ) {
        return current
      }

      return {
        ...current,
        [entry.id]: entry,
      }
    })
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries((current) => {
      if (!(id in current)) {
        return current
      }

      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({
      setEntry,
      removeEntry,
      confirmNavigationIfNeeded,
    }),
    [confirmNavigationIfNeeded, removeEntry, setEntry],
  )

  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

export function useUnsavedChanges() {
  const context = useContext(UnsavedChangesContext)

  if (!context) {
    throw new Error("useUnsavedChanges must be used within an UnsavedChangesProvider.")
  }

  return context
}

export function useRegisterUnsavedChanges(
  id: string,
  hasUnsavedChanges: boolean,
  onSave?: (() => Promise<boolean>) | null,
) {
  const { removeEntry, setEntry } = useUnsavedChanges()
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  const stableOnSave = useCallback(async () => {
    if (!onSaveRef.current) {
      return true
    }

    return await onSaveRef.current()
  }, [])

  useEffect(() => {
    setEntry({
      id,
      hasUnsavedChanges,
      onSave: onSave ? stableOnSave : null,
    })
  }, [hasUnsavedChanges, id, onSave, setEntry, stableOnSave])

  useEffect(() => {
    return () => {
      removeEntry(id)
    }
  }, [id, removeEntry])
}
