const FALLBACK_BROWSER_API_BASE_URL = "/api-proxy"
const FALLBACK_SERVER_API_BASE_URL = "http://api:8080"

const browserApiBaseUrl =
  process.env.NEXT_PUBLIC_FINANCE_API_BASE_URL?.trim() || FALLBACK_BROWSER_API_BASE_URL

const serverApiBaseUrl =
  process.env.FINANCE_API_BASE_URL?.trim() ||
  process.env.INTERNAL_FINANCE_API_BASE_URL?.trim() ||
  FALLBACK_SERVER_API_BASE_URL

export const API_BASE_URL =
  typeof window === "undefined" ? serverApiBaseUrl : browserApiBaseUrl
