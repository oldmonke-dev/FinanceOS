import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import {
  AuthenticatedApp,
  AuthProvider,
  AuthRouteGuard,
} from "@/components/providers/auth-provider"
import { ConfirmationDialogProvider } from "@/components/providers/confirmation-dialog-provider"
import { SnackbarProvider } from "@/components/providers/snackbar-provider"
import { UnsavedChangesProvider } from "@/components/providers/unsaved-changes-provider"
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
          <SnackbarProvider>
            <ConfirmationDialogProvider>
              <UnsavedChangesProvider>
                <TooltipProvider>
                  <AuthProvider>
                    <AuthRouteGuard />
                    <AuthenticatedApp>{children}</AuthenticatedApp>
                  </AuthProvider>
                </TooltipProvider>
              </UnsavedChangesProvider>
            </ConfirmationDialogProvider>
          </SnackbarProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
