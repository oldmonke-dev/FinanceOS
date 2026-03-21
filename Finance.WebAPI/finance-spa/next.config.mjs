const apiProxyDestination =
  process.env.FINANCE_API_BASE_URL ||
  process.env.INTERNAL_FINANCE_API_BASE_URL ||
  "http://localhost:5133"

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: `${apiProxyDestination}/:path*`,
      },
    ]
  },
}

export default nextConfig
