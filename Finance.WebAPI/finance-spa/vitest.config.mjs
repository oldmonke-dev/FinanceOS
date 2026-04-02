import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default {
  test: {
    environment: "jsdom",
    globals: true,
    pool: "threads",
    setupFiles: ["./test/setup.ts"],
    env: {
      NEXT_PUBLIC_FINANCE_API_BASE_URL: "http://localhost:3000",
      FINANCE_API_SERVER_BASE_URL: "http://localhost:3000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
}
