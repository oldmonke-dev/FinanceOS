"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { getAccounts } from "@/lib/accounts"
import { type Account } from "@/models/account"

type AccountsContextValue = {
  accounts: Account[]
  isLoading: boolean
  errorMessage: string | null
  refreshAccounts: () => Promise<void>
  addAccount: (account: Account) => void
}

const AccountsContext = createContext<AccountsContextValue | null>(null)

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function refreshAccounts() {
    setIsLoading(true)

    try {
      const nextAccounts = await getAccounts()
      setAccounts(nextAccounts)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unknown error while loading accounts.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  function addAccount(account: Account) {
    setAccounts((current) => {
      if (current.some((existing) => existing.id === account.id)) {
        return current
      }

      return [...current, account]
    })
  }

  useEffect(() => {
    void refreshAccounts()
  }, [])

  const value = useMemo(
    () => ({
      accounts,
      isLoading,
      errorMessage,
      refreshAccounts,
      addAccount,
    }),
    [accounts, errorMessage, isLoading],
  )

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>
}

export function useAccounts() {
  const context = useContext(AccountsContext)

  if (!context) {
    throw new Error("useAccounts must be used within an AccountsProvider.")
  }

  return context
}
