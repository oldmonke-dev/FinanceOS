"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Search, UserRound } from "lucide-react"

import { useAuth } from "@/components/providers/auth-provider"
import { Input } from "@/components/ui/input"
import {
  buildAccountPathLookup,
  getAccountAdminLabel,
  getAccountOwnerLabel,
} from "@/lib/accounts"
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
  usePortal?: boolean
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
  usePortal = true,
}: AccountSearchSelectProps) {
  const { user } = useAuth()
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
  const accountPathById = useMemo(() => buildAccountPathLookup(accounts), [accounts])
  const isAdmin = Boolean(user?.isAdmin)

  const resolveLabel = useMemo(
    () =>
      getAccountLabel ??
      ((account: Account) => accountPathById.get(account.id) ?? account.name),
    [accountPathById, getAccountLabel],
  )

  const selectedAccount = value ? accountById.get(value) ?? null : null
  const selectedLabel = selectedAccount
    ? isAdmin
      ? getAccountAdminLabel(selectedAccount, accountPathById)
      : resolveLabel(selectedAccount)
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
      const ownerLabel = getAccountOwnerLabel(account).toLowerCase()
      return (
        label.includes(normalizedQuery)
        || rawPath.includes(normalizedQuery)
        || (isAdmin && ownerLabel.includes(normalizedQuery))
      )
    })
  }, [accountPathById, isAdmin, normalizedQuery, resolveLabel, sortedAccounts])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function updatePopupPosition() {
      const container = containerRef.current
      const trigger = triggerRef.current
      if (!trigger || !container) {
        return
      }

      const rect = trigger.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const horizontalPadding = 8
      const verticalPadding = 8
      const preferredWidth = Math.max(rect.width, 352)
      const width = Math.min(preferredWidth, Math.max(280, viewportWidth - horizontalPadding * 2))
      const spaceBelow = viewportHeight - rect.bottom - 16
      const spaceAbove = rect.top - 16
      const openUpward = spaceBelow < 240 && spaceAbove > spaceBelow
      const maxHeight = Math.max(220, Math.min(360, (openUpward ? spaceAbove : spaceBelow)))
      const viewportTop = openUpward
        ? Math.max(verticalPadding, rect.top - maxHeight - 8)
        : Math.min(rect.bottom + 8, Math.max(verticalPadding, viewportHeight - maxHeight - verticalPadding))
      const viewportLeft = Math.max(
        horizontalPadding,
        Math.min(rect.left, viewportWidth - width - horizontalPadding),
      )

      setPopupStyle({
        top: usePortal ? viewportTop : viewportTop - containerRect.top,
        left: usePortal ? viewportLeft : viewportLeft - containerRect.left,
        width,
        maxHeight,
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
    window.addEventListener("scroll", handleResize, true)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("scroll", handleResize, true)
    }
  }, [isOpen, usePortal])

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

  const popupContent = isOpen && popupStyle
    ? (
        <div
          className={cn(usePortal ? "fixed inset-0 z-[100]" : "absolute inset-0 z-[100]")}
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
              "absolute rounded-xl border bg-popover text-popover-foreground shadow-md",
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
            <div className="overflow-y-auto p-1.5" style={{ maxHeight: popupStyle.maxHeight - 60 }}>
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
                  const ownerLabel = isAdmin ? getAccountOwnerLabel(account) : null

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
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block break-words">{resolveLabel(account)}</span>
                        {ownerLabel ? (
                          <span className="flex items-center gap-1 break-words text-[11px] text-muted-foreground">
                            <UserRound className="mt-0.5 size-3 shrink-0" />
                            <span>{ownerLabel}</span>
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )
    : null

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
        <span className={cn("min-w-0 truncate", !selectedAccount && "text-muted-foreground")}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 opacity-60 transition", isOpen && "rotate-180")} />
      </button>

      {usePortal && popupContent ? createPortal(popupContent, document.body) : popupContent}
    </div>
  )
}
