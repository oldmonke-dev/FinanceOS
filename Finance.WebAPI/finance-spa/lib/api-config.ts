const browserApiBaseUrl = process.env.NEXT_PUBLIC_FINANCE_API_BASE_URL?.trim()

if (!browserApiBaseUrl) {
  throw new Error("NEXT_PUBLIC_FINANCE_API_BASE_URL must be defined.")
}

const resolveApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    return browserApiBaseUrl
  }

  const serverApiBaseUrl = process.env.FINANCE_API_SERVER_BASE_URL?.trim()

  if (!serverApiBaseUrl) {
    throw new Error("FINANCE_API_SERVER_BASE_URL must be defined.")
  }

  return serverApiBaseUrl
}

export const API_BASE_URL = resolveApiBaseUrl()
