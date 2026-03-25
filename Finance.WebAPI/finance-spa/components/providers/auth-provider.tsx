"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import {
  AUTH_TOKEN_STORAGE_KEY,
  type AuthUser,
  getCurrentUser,
  getStoredAuthToken,
  login as loginRequest,
  setStoredAuthToken,
} from "@/lib/auth"
import { AccountsProvider } from "@/components/providers/accounts-provider"
import { ImportSessionsProvider } from "@/components/providers/import-sessions-provider"
import { useUnsavedChanges } from "@/components/providers/unsaved-changes-provider"
import { UserPreferencesProvider } from "@/components/providers/user-preferences-provider"

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function AuthenticatedProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserPreferencesProvider>
      <AccountsProvider>
        <ImportSessionsProvider>{children}</ImportSessionsProvider>
      </AccountsProvider>
    </UserPreferencesProvider>
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { confirmNavigationIfNeeded } = useUnsavedChanges()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function restoreSession() {
      const storedToken = getStoredAuthToken()
      if (!storedToken) {
        if (isMounted) {
          setIsLoading(false)
        }
        return
      }

      try {
        const currentUser = await getCurrentUser(storedToken)
        if (!isMounted) {
          return
        }

        setToken(storedToken)
        setUser(currentUser)
      } catch {
        setStoredAuthToken(null)
        if (!isMounted) {
          return
        }

        setToken(null)
        setUser(null)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void restoreSession()

    function handleAuthExpired() {
      setStoredAuthToken(null)
      setToken(null)
      setUser(null)
      setIsLoading(false)
      if (pathname !== "/login") {
        router.replace("/login")
      }
    }

    window.addEventListener("finance-auth-expired", handleAuthExpired as EventListener)

    return () => {
      isMounted = false
      window.removeEventListener("finance-auth-expired", handleAuthExpired as EventListener)
    }
  }, [pathname, router])

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password)
    setStoredAuthToken(result.accessToken)
    setToken(result.accessToken)
    setUser(result.user)
    setIsLoading(false)
    router.replace("/")
  }, [router])

  const logout = useCallback(async () => {
    const shouldContinue = await confirmNavigationIfNeeded()
    if (!shouldContinue) {
      return
    }

    setStoredAuthToken(null)
    setToken(null)
    setUser(null)
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    router.replace("/login")
    router.refresh()
  }, [confirmNavigationIfNeeded, router])

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout],
  )

  return (
    <AuthContext.Provider value={value}>
      {isLoading ? (
        <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Checking session...
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}

export function AuthRouteGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (isLoading) {
      return
    }

    if (!user && pathname !== "/login") {
      router.replace("/login")
      return
    }

    if (user && pathname === "/login") {
      router.replace("/")
    }
  }, [isLoading, pathname, router, user])

  return null
}

export function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return null
  }

  if (pathname === "/login") {
    return user ? (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Redirecting...
      </div>
    ) : (
      <>{children}</>
    )
  }

  if (!user) {
    return null
  }

  return <AuthenticatedProviders>{children}</AuthenticatedProviders>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.")
  }

  return context
}
