"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import {
  Trash2,
  HardDrive,
  Settings,
  Play,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Database,
  AlertTriangle,
  RefreshCw
} from "lucide-react"

interface CleanupSettings {
  enabled: boolean
  schedule: string
  keepFullCount: number
  keepDiffPerFull: number
  keepOrphanDiff: boolean
  lastRunAt: string | null
  lastRunStatus: "success" | "failed" | null
  lastRunMessage: string | null
}

interface BackupFileInfo {
  filePath: string
  fileName: string
  databaseName: string
  backupType: "FULL" | "DIFF" | "LOG"
  date: string
  sizeMb: number
}

interface CleanupAnalysis {
  totalFiles: number
  totalSizeMb: number
  filesToDelete: BackupFileInfo[]
  filesToKeep: BackupFileInfo[]
  deleteSizeMb: number
  keepSizeMb: number
  byDatabase: Record<string, {
    totalFiles: number
    deleteFiles: number
    keepFiles: number
    deleteSizeMb: number
  }>
}

interface CleanupStatus {
  settings: CleanupSettings
  analysis: CleanupAnalysis
}

const SCHEDULE_PRESETS = [
  { value: "0 6 * * 0", label: "Weekly - Sunday 06:00" },
  { value: "0 6 * * 6", label: "Weekly - Saturday 06:00" },
  { value: "0 6 * * 1", label: "Weekly - Monday 06:00" },
  { value: "0 6 * * *", label: "Daily - 06:00" },
  { value: "0 0 1 * *", label: "Monthly - 1st day 00:00" },
]

export function CleanupTab() {
  const [status, setStatus] = useState<CleanupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)

  // Form state
  const [enabled, setEnabled] = useState(false)
  const [schedule, setSchedule] = useState("0 6 * * 0")
  const [keepFullCount, setKeepFullCount] = useState(2)
  const [keepDiffPerFull, setKeepDiffPerFull] = useState(1)
  const [keepOrphanDiff, setKeepOrphanDiff] = useState(false)

  useEffect(() => {
    fetchStatus()
  }, [])

  async function fetchStatus() {
    setLoading(true)
    try {
      const res = await fetch("/api/cleanup")
      if (!res.ok) throw new Error("Failed to fetch")
      const data: CleanupStatus = await res.json()
      setStatus(data)

      // Update form state
      setEnabled(data.settings.enabled)
      setSchedule(data.settings.schedule)
      setKeepFullCount(data.settings.keepFullCount)
      setKeepDiffPerFull(data.settings.keepDiffPerFull)
      setKeepOrphanDiff(data.settings.keepOrphanDiff)
    } catch (error) {
      console.error("Failed to fetch cleanup status:", error)
      toast.error("Failed to load cleanup settings")
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          schedule,
          keepFullCount,
          keepDiffPerFull,
          keepOrphanDiff
        })
      })

      if (!res.ok) throw new Error("Failed to save")
      const data = await res.json()
      setStatus(data)
      toast.success("Cleanup settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const res = await fetch("/api/cleanup/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true })
      })

      if (!res.ok) throw new Error("Failed to analyze")
      await fetchStatus()
      setShowAnalysis(true)
      toast.success("Analysis completed")
    } catch {
      toast.error("Failed to analyze")
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleRunCleanup() {
    setRunning(true)
    setShowConfirm(false)
    try {
      const res = await fetch("/api/cleanup/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false })
      })

      if (!res.ok) throw new Error("Failed to run cleanup")
      const result = await res.json()

      if (result.success) {
        toast.success(`Deleted ${result.deletedFiles} files (${result.deletedSizeMb.toFixed(2)} MB freed)`)
      } else {
        toast.error(`Cleanup completed with ${result.errors.length} errors`)
      }

      await fetchStatus()
    } catch {
      toast.error("Failed to run cleanup")
    } finally {
      setRunning(false)
    }
  }

  function formatSize(sizeMb: number) {
    if (sizeMb < 1024) return `${sizeMb.toFixed(2)} MB`
    return `${(sizeMb / 1024).toFixed(2)} GB`
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never"
    return new Date(dateStr).toLocaleString("tr-TR")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Files</p>
                <p className="text-2xl font-bold">{status?.analysis.totalFiles || 0}</p>
              </div>
              <HardDrive className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Size</p>
                <p className="text-2xl font-bold">{formatSize(status?.analysis.totalSizeMb || 0)}</p>
              </div>
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className={status?.analysis.deleteSizeMb ? "border-orange-200 bg-orange-50 dark:bg-orange-950/20" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">To Delete</p>
                <p className="text-2xl font-bold text-orange-600">
                  {status?.analysis.filesToDelete.length || 0} files
                </p>
                <p className="text-sm text-orange-600">{formatSize(status?.analysis.deleteSizeMb || 0)}</p>
              </div>
              <Trash2 className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">To Keep</p>
                <p className="text-2xl font-bold text-green-600">
                  {status?.analysis.filesToKeep.length || 0} files
                </p>
                <p className="text-sm text-green-600">{formatSize(status?.analysis.keepSizeMb || 0)}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Cleanup Settings
          </CardTitle>
          <CardDescription>
            Configure automatic backup file cleanup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-base">Automatic Cleanup</Label>
              <p className="text-sm text-muted-foreground">
                Automatically delete old backup files based on retention policy
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_PRESETS.map(preset => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">When to run automatic cleanup</p>
            </div>

            <div className="space-y-2">
              <Label>Custom Cron (advanced)</Label>
              <Input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="0 6 * * 0"
              />
              <p className="text-xs text-muted-foreground">Cron format: min hour day month weekday</p>
            </div>
          </div>

          {/* Retention Policy */}
          <div className="p-4 border rounded-lg space-y-4">
            <h4 className="font-medium">Retention Policy</h4>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Keep FULL Backups</Label>
                <Select value={keepFullCount.toString()} onValueChange={(v) => setKeepFullCount(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <SelectItem key={n} value={n.toString()}>
                        {n} most recent
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Per database</p>
              </div>

              <div className="space-y-2">
                <Label>Keep DIFFs per FULL</Label>
                <Select value={keepDiffPerFull.toString()} onValueChange={(v) => setKeepDiffPerFull(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7].map(n => (
                      <SelectItem key={n} value={n.toString()}>
                        {n} most recent
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">DIFFs to keep per FULL backup</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label>Keep Orphan DIFFs</Label>
                <p className="text-sm text-muted-foreground">
                  Keep DIFF backups that have no parent FULL
                </p>
              </div>
              <Switch checked={keepOrphanDiff} onCheckedChange={setKeepOrphanDiff} />
            </div>
          </div>

          {/* Policy Preview */}
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Policy Summary</h4>
            <p className="text-sm text-muted-foreground">
              For each database: Keep the <span className="font-medium">{keepFullCount} most recent FULL</span> backups,
              and for each FULL keep the <span className="font-medium">{keepDiffPerFull} most recent DIFF</span> backup(s).
              {!keepOrphanDiff && " Orphan DIFFs (without parent FULL) will be deleted."}
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Last Run Status */}
      {status?.settings.lastRunAt && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Last Cleanup Run
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {status.settings.lastRunStatus === "success" ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <XCircle className="h-8 w-8 text-red-500" />
              )}
              <div>
                <p className="font-medium">{status.settings.lastRunMessage}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(status.settings.lastRunAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Manual Actions
          </CardTitle>
          <CardDescription>
            Analyze or run cleanup manually
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button variant="outline" onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Analyze (Dry Run)
                </>
              )}
            </Button>

            <Button
              variant="destructive"
              onClick={() => setShowConfirm(true)}
              disabled={running || (status?.analysis.filesToDelete.length || 0) === 0}
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Run Cleanup Now
                </>
              )}
            </Button>

            <Button variant="ghost" onClick={fetchStatus}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {(status?.analysis.filesToDelete.length || 0) === 0 && (
            <p className="text-sm text-muted-foreground">
              No files to delete based on current retention policy.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Files to Delete Preview */}
      {showAnalysis && status && status.analysis.filesToDelete.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Files to Delete ({status.analysis.filesToDelete.length})
            </CardTitle>
            <CardDescription>
              Total size: {formatSize(status.analysis.deleteSizeMb)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Group by database */}
              {Object.entries(status.analysis.byDatabase)
                .filter(([, stats]) => stats.deleteFiles > 0)
                .map(([dbName, stats]) => (
                  <div key={dbName} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{dbName}</span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="destructive">{stats.deleteFiles} to delete</Badge>
                        <Badge variant="secondary">{stats.keepFiles} to keep</Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Will free {formatSize(stats.deleteSizeMb)}
                    </p>
                  </div>
                ))}

              {/* File list (limited) */}
              <div className="max-h-64 overflow-y-auto space-y-1">
                {status.analysis.filesToDelete.slice(0, 50).map((file, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 px-2 hover:bg-muted rounded">
                    <div className="flex items-center gap-2 truncate">
                      <Badge variant="outline" className="text-xs">{file.backupType}</Badge>
                      <span className="truncate">{file.fileName}</span>
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap ml-2">
                      {formatSize(file.sizeMb)}
                    </span>
                  </div>
                ))}
                {status.analysis.filesToDelete.length > 50 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    ... and {status.analysis.filesToDelete.length - 50} more files
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run Cleanup Now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {status?.analysis.filesToDelete.length} backup files
              ({formatSize(status?.analysis.deleteSizeMb || 0)}).
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRunCleanup} className="bg-destructive text-destructive-foreground">
              Delete Files
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
