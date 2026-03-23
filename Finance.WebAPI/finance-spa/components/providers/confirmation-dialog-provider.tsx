"use client"

import { createContext, useContext, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

type ConfirmationDialogOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
}

type ConfirmationDialogRequest = ConfirmationDialogOptions & {
  kind: "confirm" | "alert"
  resolve: (value: boolean) => void
}

type ConfirmationDialogContextValue = {
  confirm: (options: ConfirmationDialogOptions) => Promise<boolean>
  alert: (options: Omit<ConfirmationDialogOptions, "cancelLabel">) => Promise<void>
}

const ConfirmationDialogContext = createContext<ConfirmationDialogContextValue | null>(null)

export function ConfirmationDialogProvider({ children }: { children: React.ReactNode }) {
  const [activeRequest, setActiveRequest] = useState<ConfirmationDialogRequest | null>(null)
  const queueRef = useRef<ConfirmationDialogRequest[]>([])

  function showNext() {
    if (activeRequest || queueRef.current.length === 0) {
      return
    }

    const [nextRequest, ...remaining] = queueRef.current
    queueRef.current = remaining
    setActiveRequest(nextRequest)
  }

  function enqueue(
    request: Omit<ConfirmationDialogRequest, "resolve">,
  ) {
    return new Promise<boolean>((resolve) => {
      queueRef.current = [...queueRef.current, { ...request, resolve }]
      if (!activeRequest) {
        const [nextRequest, ...remaining] = queueRef.current
        queueRef.current = remaining
        setActiveRequest(nextRequest)
      }
    })
  }

  function handleClose(result: boolean) {
    if (!activeRequest) {
      return
    }

    activeRequest.resolve(result)
    setActiveRequest(null)

    window.setTimeout(() => {
      showNext()
    }, 0)
  }

  const value = useMemo<ConfirmationDialogContextValue>(
    () => ({
      confirm: (options) =>
        enqueue({
          kind: "confirm",
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel ?? "Confirm",
          cancelLabel: options.cancelLabel ?? "Cancel",
          variant: options.variant ?? "default",
        }),
      alert: async (options) => {
        await enqueue({
          kind: "alert",
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel ?? "OK",
          cancelLabel: "Cancel",
          variant: options.variant ?? "default",
        })
      },
    }),
    [activeRequest],
  )

  return (
    <ConfirmationDialogContext.Provider value={value}>
      {children}
      {activeRequest ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-xl">
            <div className="space-y-2">
              <p className="text-lg font-semibold">
                {activeRequest.title ?? "Confirm action"}
              </p>
              <p className="text-sm text-muted-foreground">{activeRequest.message}</p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              {activeRequest.kind === "confirm" ? (
                <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                  {activeRequest.cancelLabel}
                </Button>
              ) : null}
              <Button
                type="button"
                variant={activeRequest.variant === "destructive" ? "destructive" : "default"}
                onClick={() => handleClose(true)}
              >
                {activeRequest.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmationDialogContext.Provider>
  )
}

export function useConfirmationDialog() {
  const context = useContext(ConfirmationDialogContext)

  if (!context) {
    throw new Error("useConfirmationDialog must be used within a ConfirmationDialogProvider.")
  }

  return context
}
