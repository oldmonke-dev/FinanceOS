"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
  type LucideIcon,
  FileSpreadsheet,
  FolderTree,
  HelpCircle,
  Home,
  LogOut,
  ScanText,
  PieChart,
  Receipt,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TableOfContents,
} from "lucide-react"

import { useAuth } from "@/components/providers/auth-provider"
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
  useSidebar,
} from "@/components/ui/sidebar"

type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  disabled?: boolean
  matches?: (pathname: string) => boolean
}

const primaryNavItems: NavItem[] = [
  { title: "Overview", href: "/", icon: Home },
  { title: "Account Tree", href: "/accounts", icon: FolderTree },
  { title: "Transactions", href: "/transactions", icon: Receipt },
  { title: "Advanced Filter", href: "/transactions/advanced", icon: TableOfContents },
  { title: "Reports", href: "/reports", icon: PieChart },
  { title: "Strategies", href: "/strategies", icon: SlidersHorizontal },
]

const importNavItems: NavItem[] = [
  { title: "Sessions", href: "/import-sessions", icon: TableOfContents },
  {
    title: "CSV Imports",
    href: "/import",
    icon: FileSpreadsheet,
    matches: (pathname) => pathname === "/import",
  },
  {
    title: "PDF Imports",
    href: "/import/pdf",
    icon: ScanText,
    matches: (pathname) => pathname === "/import/pdf",
  },
]

type AppShellProps = {
  title: string
  subtitle: string
  badge?: string
  children: React.ReactNode
}

export function AppShell({ title, subtitle, badge, children }: AppShellProps) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false)

  useEffect(() => {
    const containerElement = contentRef.current
    if (!containerElement) {
      return
    }
    const container = containerElement

    let frameId = 0

    function checkHorizontalOverflow() {
      const scrollRegions = Array.from(
        container.querySelectorAll<HTMLElement>("[data-horizontal-scroll-region]"),
      )
      let nextHasHorizontalOverflow = false

      for (const region of scrollRegions) {
        const regionHasOverflow = region.scrollWidth - region.clientWidth > 1
        region.dataset.hasHorizontalOverflow = regionHasOverflow ? "true" : "false"

        if (regionHasOverflow) {
          nextHasHorizontalOverflow = true
        }
      }

      setHasHorizontalOverflow(nextHasHorizontalOverflow)
    }

    function scheduleCheck() {
      cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(checkHorizontalOverflow)
    }

    scheduleCheck()

    const resizeObserver = new ResizeObserver(() => {
      scheduleCheck()
    })

    resizeObserver.observe(container)
    for (const element of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
      resizeObserver.observe(element)
    }

    const mutationObserver = new MutationObserver(() => {
      scheduleCheck()

      for (const element of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
        resizeObserver.observe(element)
      }
    })

    mutationObserver.observe(container, {
      attributes: true,
      childList: true,
      subtree: true,
    })

    window.addEventListener("resize", scheduleCheck)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener("resize", scheduleCheck)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [children])

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
                {primaryNavItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.matches ? item.matches(pathname) : pathname === item.href}
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

          <SidebarGroup>
            <SidebarGroupLabel>Imports</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {importNavItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.matches ? item.matches(pathname) : pathname === item.href}
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
          {user ? (
            <div className="mb-3 rounded-xl border border-sidebar-border bg-sidebar-accent/50 px-3 py-2 text-xs text-sidebar-foreground/80">
              {user.isAdmin ? (
                <div className="mb-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-sidebar-border bg-sidebar px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground">
                    <ShieldCheck className="size-3" />
                    Admin
                  </span>
                </div>
              ) : null}
              <p className="truncate font-medium text-sidebar-foreground">{user.displayName}</p>
              <p className="truncate opacity-70">{user.email}</p>
            </div>
          ) : null}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/settings"} tooltip="Settings">
                <Link href="/settings">
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/help"} tooltip="Help">
                <Link href="/help">
                  <HelpCircle />
                  <span>Help</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sign out" onClick={logout}>
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0 min-w-0 overflow-x-hidden bg-muted/30">
        <header className="flex min-w-0 items-center justify-between gap-4 border-b bg-background/80 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarOverflowHint hasHorizontalOverflow={hasHorizontalOverflow} />
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

        <div ref={contentRef} className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function SidebarOverflowHint({ hasHorizontalOverflow }: { hasHorizontalOverflow: boolean }) {
  const { state } = useSidebar()
  const [isHintVisible, setIsHintVisible] = useState(false)
  const lastOverflowStateRef = useRef(false)

  useEffect(() => {
    const shouldShowHint = hasHorizontalOverflow && state !== "collapsed"
    const overflowStarted = shouldShowHint && !lastOverflowStateRef.current

    lastOverflowStateRef.current = shouldShowHint

    if (!shouldShowHint) {
      setIsHintVisible(false)
      return
    }

    if (!overflowStarted) {
      return
    }

    setIsHintVisible(true)
    const timeoutId = window.setTimeout(() => {
      setIsHintVisible(false)
    }, 3000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [hasHorizontalOverflow, state])

  const showHint = hasHorizontalOverflow && state !== "collapsed" && isHintVisible

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="relative">
        {showHint ? (
          <>
            <span className="pointer-events-none absolute inset-0 rounded-md bg-primary/20 animate-ping" />
            <span className="pointer-events-none absolute -inset-1 rounded-lg border border-primary/30" />
          </>
        ) : null}
        <SidebarTrigger
          className={
            showHint ? "relative z-10 bg-primary/10 text-primary hover:bg-primary/15" : "relative z-10"
          }
        />
      </div>
      <span
        className={`hidden text-[11px] leading-tight text-muted-foreground transition-all md:block ${
          showHint ? "max-w-44 opacity-100" : "max-w-0 overflow-hidden opacity-0"
        }`}
      >
        Hide sidebar for better horizontal data fit.
      </span>
    </div>
  )
}
