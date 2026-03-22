const browserApiBaseUrl = process.env.NEXT_PUBLIC_FINANCE_API_BASE_URL?.trim()
const serverApiBaseUrl = process.env.FINANCE_API_SERVER_BASE_URL?.trim()

if (!browserApiBaseUrl) {
  throw new Error("NEXT_PUBLIC_FINANCE_API_BASE_URL must be defined.")
}

if (!serverApiBaseUrl) {
  throw new Error("FINANCE_API_SERVER_BASE_URL must be defined.")
}

export const API_BASE_URL =
  typeof window === "undefined" ? serverApiBaseUrl : browserApiBaseUrl
