"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { HardDrive, FolderOpen, Clock, Gauge, Calendar, Sun, Moon, CheckCircle, User, RefreshCw } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function BackupTab() {
  // Backup settings state
  const [backupPath, setBackupPath] = useState("/var/opt/mssql/backup")
  const [borgSyncEnabled, setBorgSyncEnabled] = useState(true)
  const [borgSyncMode, setBorgSyncMode] = useState<"scheduled" | "after_backups" | "manual">("after_backups")
  const [borgSyncTime, setBorgSyncTime] = useState("06:00")
  const [borgSyncBufferMinutes, setBorgSyncBufferMinutes] = useState(30)
  const [backupSettingsLoading, setBackupSettingsLoading] = useState(true)
  const [backupSettingsSaving, setBackupSettingsSaving] = useState(false)

  // Bandwidth settings state
  const [bandwidthLimitEnabled, setBandwidthLimitEnabled] = useState(true)
  const [bandwidthPeakLimit, setBandwidthPeakLimit] = useState(5000)
  const [bandwidthOffpeakLimit, setBandwidthOffpeakLimit] = useState(0)
  const [bandwidthPeakStart, setBandwidthPeakStart] = useState("08:00")
  const [bandwidthPeakEnd, setBandwidthPeakEnd] = useState("20:00")
  const [bandwidthWeekendUnlimited, setBandwidthWeekendUnlimited] = useState(true)

  useEffect(() => {
    fetchBackupSettings()
  }, [])

  async function fetchBackupSettings() {
    try {
      const res = await fetch("/api/settings/backup")
      const data = await res.json()

      // Basic settings
      setBackupPath(data.backupPath || "/var/opt/mssql/backup")
      setBorgSyncEnabled(data.borgSyncEnabled ?? true)

      // Sync mode settings
      setBorgSyncMode(data.borgSyncMode || "after_backups")
      setBorgSyncTime(data.borgSyncTime || "06:00")
      setBorgSyncBufferMinutes(data.borgSyncBufferMinutes || 30)

      // Bandwidth settings
      setBandwidthLimitEnabled(data.bandwidthLimitEnabled ?? true)
      setBandwidthPeakLimit(data.bandwidthPeakLimit || 5000)
      setBandwidthOffpeakLimit(data.bandwidthOffpeakLimit || 0)
      setBandwidthPeakStart(data.bandwidthPeakStart || "08:00")
      setBandwidthPeakEnd(data.bandwidthPeakEnd || "20:00")
      setBandwidthWeekendUnlimited(data.bandwidthWeekendUnlimited ?? true)
    } catch {
      console.error("Failed to load backup settings")
    } finally {
      setBackupSettingsLoading(false)
    }
  }

  async function saveBackupSettings() {
    setBackupSettingsSaving(true)
    try {
      const res = await fetch("/api/settings/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupPath,
          borgSyncEnabled,
          borgSyncMode,
          borgSyncTime,
          borgSyncBufferMinutes,
          bandwidthLimitEnabled,
          bandwidthPeakLimit,
          bandwidthOffpeakLimit,
          bandwidthPeakStart,
          bandwidthPeakEnd,
          bandwidthWeekendUnlimited
        })
      })

      if (res.ok) {
        toast.success("Backup settings saved")
      } else {
        toast.error("Failed to save backup settings")
      }
    } catch {
      toast.error("Failed to save backup settings")
    } finally {
      setBackupSettingsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          <CardTitle>Backup Storage Settings</CardTitle>
        </div>
        <CardDescription>Configure backup storage path and Hetzner sync schedule</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {backupSettingsLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Backup Path */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Default Backup Path
              </Label>
              <Input
                value={backupPath}
                onChange={(e) => setBackupPath(e.target.value)}
                placeholder="/var/opt/mssql/backup"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                SQL Server backup files will be stored here. Use WSL path format: /mnt/c/... for Windows drives
              </p>
            </div>

            {/* Borg Sync Settings */}
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4" />
                <Label className="text-base font-medium">Hetzner Sync Scheduling</Label>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Automatic Sync</Label>
                  <p className="text-xs text-muted-foreground">Enable automatic sync to Hetzner StorageBox</p>
                </div>
                <Switch
                  checked={borgSyncEnabled}
                  onCheckedChange={setBorgSyncEnabled}
                />
              </div>

              {borgSyncEnabled && (
                <>
                  {/* Sync Mode Selection */}
                  <div className="space-y-2">
                    <Label>Sync Mode</Label>
                    <Select value={borgSyncMode} onValueChange={(v) => setBorgSyncMode(v as typeof borgSyncMode)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="after_backups">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span>After Backups Complete</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="scheduled">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-500" />
                            <span>Scheduled Time</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="manual">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-orange-500" />
                            <span>Manual Only</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {borgSyncMode === "after_backups" && "Sync will start automatically after all daily backup jobs complete"}
                      {borgSyncMode === "scheduled" && "Sync will run at the specified time every day"}
                      {borgSyncMode === "manual" && "Sync only when manually triggered from Storage page"}
                    </p>
                  </div>

                  {/* Mode-specific settings */}
                  {borgSyncMode === "after_backups" && (
                    <div className="space-y-2">
                      <Label>Buffer Time (minutes)</Label>
                      <Input
                        type="number"
                        value={borgSyncBufferMinutes}
                        onChange={(e) => setBorgSyncBufferMinutes(parseInt(e.target.value) || 30)}
                        className="w-32"
                        min={0}
                        max={120}
                      />
                      <p className="text-xs text-muted-foreground">Wait time after all backups complete before starting sync</p>
                    </div>
                  )}

                  {borgSyncMode === "scheduled" && (
                    <div className="space-y-2">
                      <Label>Sync Time</Label>
                      <Input
                        type="time"
                        value={borgSyncTime}
                        onChange={(e) => setBorgSyncTime(e.target.value)}
                        className="w-32"
                      />
                      <p className="text-xs text-muted-foreground">Time to sync backups to Hetzner (recommended: after backup window)</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bandwidth Settings */}
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="h-4 w-4" />
                <Label className="text-base font-medium">Bandwidth Management</Label>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Bandwidth Limits</Label>
                  <p className="text-xs text-muted-foreground">Limit upload speed during peak hours</p>
                </div>
                <Switch
                  checked={bandwidthLimitEnabled}
                  onCheckedChange={setBandwidthLimitEnabled}
                />
              </div>

              {bandwidthLimitEnabled && (
                <>
                  {/* Peak Hours Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Sun className="h-4 w-4 text-yellow-500" />
                        Peak Hours Limit
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={bandwidthPeakLimit}
                          onChange={(e) => setBandwidthPeakLimit(parseInt(e.target.value) || 5000)}
                          className="w-24"
                          min={0}
                          step={1000}
                        />
                        <span className="text-sm text-muted-foreground">KB/s</span>
                        <Badge variant="secondary">{(bandwidthPeakLimit / 1024).toFixed(1)} MB/s</Badge>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Moon className="h-4 w-4 text-blue-500" />
                        Off-Peak Limit
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={bandwidthOffpeakLimit}
                          onChange={(e) => setBandwidthOffpeakLimit(parseInt(e.target.value) || 0)}
                          className="w-24"
                          min={0}
                          step={1000}
                        />
                        <span className="text-sm text-muted-foreground">KB/s</span>
                        <Badge variant="secondary">{bandwidthOffpeakLimit === 0 ? "Unlimited" : `${(bandwidthOffpeakLimit / 1024).toFixed(1)} MB/s`}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">0 = Unlimited</p>
                    </div>
                  </div>

                  {/* Peak Hours Time Range */}
                  <div className="space-y-2">
                    <Label>Peak Hours Range</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={bandwidthPeakStart}
                        onChange={(e) => setBandwidthPeakStart(e.target.value)}
                        className="w-28"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={bandwidthPeakEnd}
                        onChange={(e) => setBandwidthPeakEnd(e.target.value)}
                        className="w-28"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Business hours when bandwidth should be limited</p>
                  </div>

                  {/* Weekend Setting */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Unlimited on Weekends
                      </Label>
                      <p className="text-xs text-muted-foreground">Ignore peak hour limits on Saturday and Sunday</p>
                    </div>
                    <Switch
                      checked={bandwidthWeekendUnlimited}
                      onCheckedChange={setBandwidthWeekendUnlimited}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Save Button */}
            <div className="pt-2">
              <Button onClick={saveBackupSettings} disabled={backupSettingsSaving}>
                {backupSettingsSaving ? "Saving..." : "Save Backup Settings"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
