"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Mail, Bell, Send, CheckCircle, XCircle, RefreshCw } from "lucide-react"

interface NotificationSettings {
  emails: string[]
  dailySummaryEnabled: boolean
  failureAlertsEnabled: boolean
  summaryTime: string
  connection: { success: boolean; error?: string }
  lastDaySummary: {
    totalJobs: number
    successCount: number
    failedCount: number
    totalBackupSizeMb: number
  }
}

export function NotificationsTab() {
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null)
  const [notificationLoading, setNotificationLoading] = useState(true)
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [sendingSummary, setSendingSummary] = useState(false)
  const [emailInput, setEmailInput] = useState("")
  const [summaryTimeInput, setSummaryTimeInput] = useState("08:00")

  useEffect(() => {
    fetchNotificationSettings()
  }, [])

  async function fetchNotificationSettings() {
    try {
      const res = await fetch("/api/notifications")
      const data = await res.json()
      setNotificationSettings({
        emails: data.emails || [],
        dailySummaryEnabled: data.settings?.dailySummaryEnabled ?? true,
        failureAlertsEnabled: data.settings?.failureAlertsEnabled ?? true,
        summaryTime: data.settings?.summaryTime || "08:00",
        connection: data.connection || { success: false },
        lastDaySummary: data.lastDaySummary || { totalJobs: 0, successCount: 0, failedCount: 0, totalBackupSizeMb: 0 }
      })
      setEmailInput(data.emails?.join(", ") || "")
      setSummaryTimeInput(data.settings?.summaryTime || "08:00")
    } catch {
      toast.error("Failed to load notification settings")
    } finally {
      setNotificationLoading(false)
    }
  }

  async function saveNotificationSettings() {
    setNotificationSaving(true)
    try {
      const emails = emailInput.split(",").map((e: string) => e.trim()).filter(Boolean)
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails,
          dailySummaryEnabled: notificationSettings?.dailySummaryEnabled,
          failureAlertsEnabled: notificationSettings?.failureAlertsEnabled,
          summaryTime: summaryTimeInput
        })
      })

      if (res.ok) {
        toast.success("Notification settings saved")
        fetchNotificationSettings()
      } else {
        toast.error("Failed to save settings")
      }
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setNotificationSaving(false)
    }
  }

  async function testEmailConnection() {
    setTestingEmail(true)
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" })
      const data = await res.json()

      if (data.success) {
        toast.success("Test email sent successfully!")
      } else {
        toast.error(data.error || "Failed to send test email")
      }
    } catch {
      toast.error("Failed to test email connection")
    } finally {
      setTestingEmail(false)
    }
  }

  async function sendDailySummary() {
    setSendingSummary(true)
    try {
      const res = await fetch("/api/notifications/send-summary", { method: "POST" })
      const data = await res.json()

      if (data.success) {
        toast.success(`Summary email sent! (${data.summary.totalJobs} jobs)`)
      } else {
        toast.error(data.message || "Failed to send summary")
      }
    } catch {
      toast.error("Failed to send summary email")
    } finally {
      setSendingSummary(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>Email Notifications</CardTitle>
          </div>
          {notificationSettings?.connection && (
            <Badge variant={notificationSettings.connection.success ? "default" : "destructive"}>
              {notificationSettings.connection.success ? (
                <><CheckCircle className="h-3 w-3 mr-1" /> Connected</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> Not Connected</>
              )}
            </Badge>
          )}
        </div>
        <CardDescription>Configure email notifications for job alerts and daily summaries</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {notificationLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Email Recipients */}
            <div className="space-y-2">
              <Label>Email Recipients</Label>
              <Input
                placeholder="email@example.com, another@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Separate multiple emails with commas</p>
            </div>

            {/* Notification Options */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Daily Summary Email
                  </Label>
                  <p className="text-xs text-muted-foreground">Receive a daily summary of all backup and maintenance jobs</p>
                </div>
                <Switch
                  checked={notificationSettings?.dailySummaryEnabled ?? true}
                  onCheckedChange={(checked: boolean) =>
                    setNotificationSettings(prev => prev ? { ...prev, dailySummaryEnabled: checked } : null)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    Failure Alerts
                  </Label>
                  <p className="text-xs text-muted-foreground">Get notified immediately when a job fails</p>
                </div>
                <Switch
                  checked={notificationSettings?.failureAlertsEnabled ?? true}
                  onCheckedChange={(checked: boolean) =>
                    setNotificationSettings(prev => prev ? { ...prev, failureAlertsEnabled: checked } : null)
                  }
                />
              </div>
            </div>

            {/* Summary Time */}
            <div className="space-y-2">
              <Label>Daily Summary Time</Label>
              <Input
                type="time"
                value={summaryTimeInput}
                onChange={(e) => setSummaryTimeInput(e.target.value)}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">Time to send the daily summary email</p>
            </div>

            {/* Last Day Stats */}
            {notificationSettings?.lastDaySummary && notificationSettings.lastDaySummary.totalJobs > 0 && (
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <p className="text-sm font-medium">Last 24 Hours</p>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Jobs</p>
                    <p className="font-medium">{notificationSettings.lastDaySummary.totalJobs}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Success</p>
                    <p className="font-medium text-green-600">{notificationSettings.lastDaySummary.successCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Failed</p>
                    <p className="font-medium text-red-600">{notificationSettings.lastDaySummary.failedCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Backup Size</p>
                    <p className="font-medium">{notificationSettings.lastDaySummary.totalBackupSizeMb.toFixed(1)} MB</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={saveNotificationSettings} disabled={notificationSaving}>
                {notificationSaving ? "Saving..." : "Save Settings"}
              </Button>
              <Button variant="outline" onClick={testEmailConnection} disabled={testingEmail}>
                {testingEmail ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Test Email</>
                )}
              </Button>
              <Button variant="outline" onClick={sendDailySummary} disabled={sendingSummary}>
                {sendingSummary ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  <><Mail className="h-4 w-4 mr-2" /> Send Summary Now</>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
