import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { AccountsProvider } from "@/components/providers/accounts-provider"
import { ImportSessionsProvider } from "@/components/providers/import-sessions-provider"
import { UserPreferencesProvider } from "@/components/providers/user-preferences-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <UserPreferencesProvider>
              <AccountsProvider>
                <ImportSessionsProvider>{children}</ImportSessionsProvider>
              </AccountsProvider>
            </UserPreferencesProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
