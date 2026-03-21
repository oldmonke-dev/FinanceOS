"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { type Account } from "@/models/account"

type AccountSearchSelectProps = {
  accounts: Account[]
  value: string | null
  onValueChange: (value: string | null) => void
  placeholder?: string
  emptyLabel?: string
  allowEmpty?: boolean
  disabled?: boolean
  className?: string
  triggerClassName?: string
  contentClassName?: string
  getAccountLabel?: (account: Account) => string
}

export function AccountSearchSelect({
  accounts,
  value,
  onValueChange,
  placeholder = "Select account",
  emptyLabel = "Unassigned",
  allowEmpty = false,
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
  getAccountLabel,
}: AccountSearchSelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [popupStyle, setPopupStyle] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  )
  const accountPathById = useMemo(() => {
    const pathById = new Map<string, string>()

    function buildPath(accountId: string): string {
      const cached = pathById.get(accountId)
      if (cached) {
        return cached
      }

      const segments: string[] = []
      let current = accountById.get(accountId)

      while (current) {
        segments.unshift(current.name)
        current =
          current.parentAccountId != null
            ? accountById.get(current.parentAccountId) ?? undefined
            : undefined
      }

      const path = segments.join(" / ")
      pathById.set(accountId, path)
      return path
    }

    accounts.forEach((account) => {
      buildPath(account.id)
    })

    return pathById
  }, [accountById, accounts])

  const resolveLabel = useMemo(
    () =>
      getAccountLabel ??
      ((account: Account) => accountPathById.get(account.id) ?? account.name),
    [accountPathById, getAccountLabel],
  )

  const selectedAccount = value ? accountById.get(value) ?? null : null
  const selectedLabel = selectedAccount
    ? resolveLabel(selectedAccount)
    : allowEmpty
      ? emptyLabel
      : placeholder
  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort((left, right) =>
        resolveLabel(left).localeCompare(resolveLabel(right), undefined, {
          sensitivity: "base",
          numeric: true,
        }),
      ),
    [accounts, resolveLabel],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredAccounts = useMemo(() => {
    if (!normalizedQuery) {
      return sortedAccounts
    }

    return sortedAccounts.filter((account) => {
      const label = resolveLabel(account).toLowerCase()
      const rawPath = (accountPathById.get(account.id) ?? account.name).toLowerCase()
      return label.includes(normalizedQuery) || rawPath.includes(normalizedQuery)
    })
  }, [accountPathById, normalizedQuery, resolveLabel, sortedAccounts])

  useEffect(() => {
    if (!isOpen) {
      setPopupStyle(null)
      return
    }

    function updatePopupPosition() {
      const trigger = triggerRef.current
      if (!trigger) {
        return
      }

      const rect = trigger.getBoundingClientRect()
      const width = Math.max(rect.width, 352)

      setPopupStyle({
        top: Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - 248)),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        maxHeight: Math.max(240, window.innerHeight - rect.bottom - 24),
      })
    }

    updatePopupPosition()

    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)

    function handleResize() {
      updatePopupPosition()
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener("resize", handleResize)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false)
        setQuery("")
      }
    }

    window.addEventListener("keydown", handleEscape)

    return () => {
      window.removeEventListener("keydown", handleEscape)
    }
  }, [isOpen])

  function handleSelect(nextValue: string | null) {
    onValueChange(nextValue)
    setIsOpen(false)
    setQuery("")
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() =>
          setIsOpen((current) => {
            const next = !current

            if (!next) {
              setQuery("")
            }

            return next
          })
        }
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 py-1 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          isOpen && "border-primary bg-accent ring-2 ring-primary/20",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !selectedAccount && "text-muted-foreground")}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 opacity-60 transition", isOpen && "rotate-180")} />
      </button>

      {isOpen && popupStyle
        ? createPortal(
            <div
              className="fixed inset-0 z-[100]"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setIsOpen(false)
                  setQuery("")
                }
              }}
            >
              <div
                ref={popupRef}
                className={cn(
                  "absolute min-w-[22rem] rounded-xl border bg-popover text-popover-foreground shadow-md sm:min-w-[26rem]",
                  contentClassName,
                )}
                style={{
                  left: popupStyle.left,
                  width: popupStyle.width,
                  top: popupStyle.top,
                  maxHeight: popupStyle.maxHeight,
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="border-b p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={inputRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search account"
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto p-1.5">
                  {allowEmpty ? (
                    <button
                      type="button"
                      onClick={() => handleSelect(null)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted"
                    >
                      <span className="flex size-4 items-center justify-center">
                        {!selectedAccount ? <Check className="size-4" /> : null}
                      </span>
                      <span className="truncate">{emptyLabel}</span>
                    </button>
                  ) : null}
                  {filteredAccounts.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-muted-foreground">No accounts match.</p>
                  ) : (
                    filteredAccounts.map((account) => {
                      const isSelected = account.id === value

                      return (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => handleSelect(account.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted"
                        >
                          <span className="flex size-4 items-center justify-center">
                            {isSelected ? <Check className="size-4" /> : null}
                          </span>
                          <span className="break-words">{resolveLabel(account)}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
