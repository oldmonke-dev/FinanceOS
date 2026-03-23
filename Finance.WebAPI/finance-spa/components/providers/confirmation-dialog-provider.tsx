"use client"

import { createContext, useContext, useMemo, useRef, useState } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
      <DialogPrimitive.Root open={activeRequest != null} onOpenChange={(open) => !open && handleClose(false)}>
        {activeRequest ? (
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay
              className="fixed inset-0 z-[200] bg-black/45 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
            />
            <DialogPrimitive.Content
              className={cn(
                "fixed top-1/2 left-1/2 z-[201] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border bg-card p-6 shadow-xl duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              )}
            >
              <div className="space-y-2">
                <DialogPrimitive.Title className="text-lg font-semibold">
                  {activeRequest.title ?? "Confirm action"}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {activeRequest.message}
                </DialogPrimitive.Description>
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
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </DialogPrimitive.Root>
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
