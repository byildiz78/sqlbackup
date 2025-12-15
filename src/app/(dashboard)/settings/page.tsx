"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AccountTab, NotificationsTab, BackupTab, CleanupTab, AboutTab } from "@/components/settings"
import { User, Bell, HardDrive, Trash2, Info } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and application settings</p>
      </div>

      <Tabs defaultValue="account" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-[750px]">
          <TabsTrigger value="account" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            <span className="hidden sm:inline">Backup</span>
          </TabsTrigger>
          <TabsTrigger value="cleanup" className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Cleanup</span>
          </TabsTrigger>
          <TabsTrigger value="about" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            <span className="hidden sm:inline">About</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-6">
          <AccountTab />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="backup" className="space-y-6">
          <BackupTab />
        </TabsContent>

        <TabsContent value="cleanup" className="space-y-6">
          <CleanupTab />
        </TabsContent>

        <TabsContent value="about" className="space-y-6">
          <AboutTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
