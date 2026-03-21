const FALLBACK_API_BASE_URL = "http://localhost:5132"

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_FINANCE_API_BASE_URL?.trim() || FALLBACK_API_BASE_URL
