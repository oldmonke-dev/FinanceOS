import { API_BASE_URL } from "@/lib/api-config"

export const AUTH_TOKEN_STORAGE_KEY = "finance.auth.token"

export type AuthUser = {
  id: string
  email: string
  displayName: string
}

export type LoginResult = {
  accessToken: string
  expiresAt: string
  user: AuthUser
}

type AuthErrorPayload = {
  message?: string
}

function normalizeUser(raw: Record<string, unknown>): AuthUser {
  return {
    id: String(raw.id ?? raw.Id ?? ""),
    email: String(raw.email ?? raw.Email ?? ""),
    displayName: String(raw.displayName ?? raw.DisplayName ?? ""),
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const raw = (await response.json()) as AuthErrorPayload
    return raw.message ?? fallback
  } catch {
    return fallback
  }
}

export function getStoredAuthToken() {
  if (typeof window === "undefined") {
    return null
  }

  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  return token && token.trim().length > 0 ? token : null
}

export function setStoredAuthToken(token: string | null) {
  if (typeof window === "undefined") {
    return
  }

  if (!token) {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await fetch(`${API_BASE_URL}/Auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to sign in: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const raw = (await response.json()) as Record<string, unknown>

  return {
    accessToken: String(raw.accessToken ?? raw.AccessToken ?? ""),
    expiresAt: String(raw.expiresAt ?? raw.ExpiresAt ?? ""),
    user: normalizeUser((raw.user ?? raw.User ?? {}) as Record<string, unknown>),
  }
}

export async function getCurrentUser(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/Auth/me`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to load current user: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const raw = (await response.json()) as Record<string, unknown>
  return normalizeUser(raw)
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getStoredAuthToken()
  const headers = new Headers(init?.headers)

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(input, {
    ...init,
    headers,
  })

  if (response.status === 401) {
    setStoredAuthToken(null)

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("finance-auth-expired"))
    }
  }

  return response
}
