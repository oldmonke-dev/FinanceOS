import { authFetch } from "@/lib/auth"
import { API_BASE_URL } from "@/lib/api-config"
import {
  type FinancialYearMode,
  type NumberGroupingStyle,
  type UserPreference,
} from "@/models/user-preference"

function normalizeUserPreference(raw: Record<string, unknown>): UserPreference {
  return {
    userId: String(raw.userId ?? raw.UserId ?? ""),
    numberGroupingStyle: normalizeNumberGroupingStyle(
      raw.numberGroupingStyle ?? raw.NumberGroupingStyle,
    ),
    financialYearMode: normalizeFinancialYearMode(
      raw.financialYearMode ?? raw.FinancialYearMode,
    ),
    customFinancialYearStartDate:
      raw.customFinancialYearStartDate == null && raw.CustomFinancialYearStartDate == null
        ? null
        : String(raw.customFinancialYearStartDate ?? raw.CustomFinancialYearStartDate),
    updatedAt: String(raw.updatedAt ?? raw.UpdatedAt ?? ""),
  }
}

function normalizeNumberGroupingStyle(value: unknown): NumberGroupingStyle {
  return value === "indian" ? "indian" : "international"
}

function normalizeFinancialYearMode(value: unknown): FinancialYearMode {
  if (value === "american") {
    return "american"
  }

  if (value === "custom") {
    return "custom"
  }

  return "indian"
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const error = (await response.json()) as { message?: string }
    return error.message ?? fallback
  } catch {
    return fallback
  }
}

export async function getUserPreference(): Promise<UserPreference> {
  const response = await authFetch(`${API_BASE_URL}/UserPreferences`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to fetch user preferences: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeUserPreference(data)
}

export async function updateUserPreference(input: {
  numberGroupingStyle: NumberGroupingStyle
  financialYearMode: FinancialYearMode
  customFinancialYearStartDate: string | null
}): Promise<UserPreference> {
  const response = await authFetch(`${API_BASE_URL}/UserPreferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to update user preferences: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return normalizeUserPreference(data)
}
