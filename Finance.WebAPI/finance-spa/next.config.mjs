const apiServerBaseUrl = process.env.FINANCE_API_SERVER_BASE_URL

if (!apiServerBaseUrl?.trim()) {
  throw new Error("FINANCE_API_SERVER_BASE_URL must be defined.")
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: `${apiServerBaseUrl.trim()}/:path*`,
      },
    ]
  },
}

export default nextConfig
