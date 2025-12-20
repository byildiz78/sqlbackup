"use client"

import {
  Database,
  Server,
  HardDrive,
  Calendar,
  Settings,
  LayoutDashboard,
  Wrench,
  LogOut,
  FolderOpen,
  Cloud,
  Activity,
} from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { signOut } from "next-auth/react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "SQL Servers",
    url: "/servers",
    icon: Server,
  },
  {
    title: "SQL Health",
    url: "/sql-health",
    icon: Activity,
  },
  {
    title: "Databases",
    url: "/databases",
    icon: Database,
  },
  {
    title: "Backup Jobs",
    url: "/backups",
    icon: Calendar,
  },
  {
    title: "Maintenance",
    url: "/maintenance",
    icon: Wrench,
  },
  {
    title: "Local Storage",
    url: "/local-storage",
    icon: FolderOpen,
  },
  {
    title: "Remote Storage",
    url: "/storage",
    icon: Cloud,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-4 py-3">
          <Database className="h-6 w-6 text-blue-500" />
          <span className="font-semibold text-lg">robotpos Backup Manager</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="p-4">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
