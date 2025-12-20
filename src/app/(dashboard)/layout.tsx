"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import {
  Database,
  Server,
  HardDrive,
  Calendar,
  Settings,
  LayoutDashboard,
  Wrench,
  LogOut,
  Menu,
  X,
  Clock,
  BarChart3,
  FolderOpen,
  Cloud,
  Activity,
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

const menuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "SQL Servers", url: "/servers", icon: Server },
  { title: "SQL Health", url: "/sql-health", icon: Activity },
  { title: "Databases", url: "/databases", icon: Database },
  { title: "Scheduled Jobs", url: "/jobs", icon: Clock },
  { title: "Backup Jobs", url: "/backups", icon: Calendar },
  { title: "Maintenance", url: "/maintenance", icon: Wrench },
  { title: "Local Storage", url: "/local-storage", icon: FolderOpen },
  { title: "Remote Storage", url: "/storage", icon: Cloud },
  { title: "Settings", url: "/settings", icon: Settings },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full w-64 bg-card border-r transform transition-transform duration-200 ease-in-out",
        "md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2 px-4 py-4 border-b">
            <Database className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">robotPOS Backup Manager</span>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto md:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {menuItems.map((item) => (
              <Link
                key={item.url}
                href={item.url}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  pathname === item.url
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            ))}
          </nav>

          {/* Sign out */}
          <div className="p-4 border-t">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="md:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
        </header>

        {/* Page content */}
        <main className="p-4 md:p-6">
          {children}
        </main>
      </div>

      <Toaster />
    </div>
  )
}
