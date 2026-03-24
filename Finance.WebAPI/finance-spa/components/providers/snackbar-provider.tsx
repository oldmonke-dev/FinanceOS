"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Info, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"

type SnackbarTone = "success" | "error" | "info"

type SnackbarOptions = {
  message: string
  tone?: SnackbarTone
  durationMs?: number
}

type SnackbarItem = Required<SnackbarOptions> & {
  id: number
}

type SnackbarContextValue = {
  showSnackbar: (options: SnackbarOptions) => void
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null)

const toneIconClassName = {
  success: "text-emerald-600",
  error: "text-destructive",
  info: "text-muted-foreground",
} satisfies Record<SnackbarTone, string>

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<SnackbarItem[]>([])
  const nextIdRef = useRef(1)

  function showSnackbar(options: SnackbarOptions) {
    const id = nextIdRef.current++
    const item: SnackbarItem = {
      id,
      message: options.message,
      tone: options.tone ?? "info",
      durationMs: options.durationMs ?? 2000,
    }

    setItems((current) => [...current, item])
  }

  useEffect(() => {
    if (items.length === 0) {
      return
    }

    const timers = items.map((item) =>
      window.setTimeout(() => {
        setItems((current) => current.filter((existing) => existing.id !== item.id))
      }, item.durationMs),
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [items])

  const value = useMemo<SnackbarContextValue>(
    () => ({
      showSnackbar,
    }),
    [],
  )

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[220] flex justify-center px-4">
        <div className="flex w-full max-w-md flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "overflow-hidden rounded-2xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/90 transition-all",
              "border-border text-foreground",
            )}
          >
            <div className="flex items-start gap-3">
              <SnackbarToneIcon tone={item.tone} />
              <p className="pr-2 text-sm font-medium leading-5">{item.message}</p>
            </div>
          </div>
        ))}
        </div>
      </div>
    </SnackbarContext.Provider>
  )
}

function SnackbarToneIcon({ tone }: { tone: SnackbarTone }) {
  const className = cn("mt-0.5 size-4 shrink-0", toneIconClassName[tone])

  if (tone === "success") {
    return <CheckCircle2 className={className} />
  }

  if (tone === "error") {
    return <XCircle className={className} />
  }

  return <Info className={className} />
}

export function useSnackbar() {
  const context = useContext(SnackbarContext)

  if (!context) {
    throw new Error("useSnackbar must be used within a SnackbarProvider.")
  }

  return context
}
