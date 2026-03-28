"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { getUserPreference, updateUserPreference } from "@/lib/user-preferences"
import {
  type FinancialYearMode,
  type NumberGroupingStyle,
  type UserPreference,
} from "@/models/user-preference"

type UserPreferencesContextValue = {
  preference: UserPreference | null
  isLoading: boolean
  errorMessage: string | null
  refreshPreference: () => Promise<void>
  updatePreferences: (input: {
    numberGroupingStyle: NumberGroupingStyle
    financialYearMode: FinancialYearMode
    customFinancialYearStartDate: string | null
  }) => Promise<void>
  formatNumber: (value: number, fractionDigits?: number) => string
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null)

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<UserPreference | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function refreshPreference() {
    setIsLoading(true)

    try {
      const nextPreference = await getUserPreference()
      setPreference(nextPreference)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unknown error while loading user preferences.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  async function updatePreferences(input: {
    numberGroupingStyle: NumberGroupingStyle
    financialYearMode: FinancialYearMode
    customFinancialYearStartDate: string | null
  }) {
    const updatedPreference = await updateUserPreference(input)
    setPreference(updatedPreference)
    setErrorMessage(null)
  }

  useEffect(() => {
    void refreshPreference()
  }, [])

  const locale = preference?.numberGroupingStyle === "indian" ? "en-IN" : "en-US"

  const value = useMemo(
    () => ({
      preference,
      isLoading,
      errorMessage,
      refreshPreference,
      updatePreferences,
      formatNumber: (value: number, fractionDigits = 2) =>
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        }).format(value),
    }),
    [errorMessage, isLoading, locale, preference],
  )

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext)

  if (!context) {
    throw new Error("useUserPreferences must be used within a UserPreferencesProvider.")
  }

  return context
}
