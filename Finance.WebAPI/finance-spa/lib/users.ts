import { API_BASE_URL } from "@/lib/api-config"
import { authFetch } from "@/lib/auth"
import { type CreateUserInput, type User } from "@/models/user"

function normalizeUser(raw: Record<string, unknown>): User {
  return {
    id: String(raw.id ?? raw.Id ?? ""),
    email: String(raw.email ?? raw.Email ?? ""),
    displayName: String(raw.displayName ?? raw.DisplayName ?? ""),
    isAdmin: Boolean(raw.isAdmin ?? raw.IsAdmin ?? false),
    isSuperUser: Boolean(raw.isSuperUser ?? raw.IsSuperUser ?? false),
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? false),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ""),
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const raw = (await response.json()) as { message?: string }
    return raw.message ?? fallback
  } catch {
    return fallback
  }
}

export async function getUsers(): Promise<User[]> {
  const response = await authFetch(`${API_BASE_URL}/Users`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to load users: ${response.status} ${response.statusText}`),
    )
  }

  const raw = (await response.json()) as Array<Record<string, unknown>>
  return raw.map(normalizeUser)
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const response = await authFetch(`${API_BASE_URL}/Users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to create user: ${response.status} ${response.statusText}`),
    )
  }

  const raw = (await response.json()) as Record<string, unknown>
  return normalizeUser(raw)
}

export async function updateUserAdmin(id: string, isAdmin: boolean): Promise<User> {
  const response = await authFetch(`${API_BASE_URL}/Users/${id}/admin`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ isAdmin }),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to update user admin access: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const raw = (await response.json()) as Record<string, unknown>
  return normalizeUser(raw)
}

export async function deleteUser(id: string): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/Users/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to delete user: ${response.status} ${response.statusText}`),
    )
  }
}
