"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  FileSpreadsheet,
  FolderTree,
  Home,
  LineChart,
  Receipt,
  Settings,
  SlidersHorizontal,
  TableOfContents,
  Wallet,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const navItems = [
  { title: "Overview", href: "/", icon: Home },
  { title: "Account Tree", href: "/accounts", icon: FolderTree },
  { title: "Transactions", href: "/transactions", icon: Receipt },
  { title: "Importer", href: "/import", icon: FileSpreadsheet },
  { title: "Import Sessions", href: "/import-sessions", icon: TableOfContents },
  { title: "Strategies", href: "/strategies", icon: SlidersHorizontal },
  { title: "Budgets", href: "#", icon: Wallet, disabled: true },
  { title: "Investments", href: "#", icon: LineChart, disabled: true },
]

type AppShellProps = {
  title: string
  subtitle: string
  badge?: string
  children: React.ReactNode
}

export function AppShell({ title, subtitle, badge, children }: AppShellProps) {
  const pathname = usePathname()

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader className="px-3 py-4">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-primary px-3 py-4 text-sidebar-primary-foreground">
            <p className="text-xs uppercase tracking-[0.24em] opacity-70">
              Finance OS
            </p>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      tooltip={item.title}
                    >
                      <Link
                        href={item.href}
                        aria-disabled={item.disabled}
                        className={item.disabled ? "pointer-events-none opacity-50" : ""}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/settings"} tooltip="Settings">
                <Link href="/settings">
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0 min-w-0 overflow-x-hidden bg-muted/30">
        <header className="flex min-w-0 items-center justify-between gap-4 border-b bg-background/80 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
              <h1 className="truncate text-xl font-semibold">{title}</h1>
            </div>
          </div>
          {badge ? (
            <div className="shrink-0 rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground">
              {badge}
            </div>
          ) : null}
        </header>

        <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
