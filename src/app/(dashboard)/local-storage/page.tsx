"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
  FolderOpen,
  HardDrive,
  Database,
  Trash2,
  Search,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  FileArchive,
  Calendar
} from "lucide-react"

interface BackupFileInfo {
  filePath: string
  fileName: string
  databaseName: string
  backupType: "FULL" | "DIFF" | "LOG"
  date: string
  sizeMb: number
}

interface DatabaseStats {
  name: string
  fullCount: number
  diffCount: number
  logCount: number
  totalSizeMb: number
  lastBackup: string | null
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

interface LocalStorageData {
  path: string
  exists: boolean
  totalFiles: number
  totalSizeMb: number
  fullBackups: number
  diffBackups: number
  logBackups: number
  fullSizeMb: number
  diffSizeMb: number
  logSizeMb: number
  databaseCount: number
  databases: DatabaseStats[]
  recentBackups: BackupFileInfo[]
  oldestBackup: string | null
  newestBackup: string | null
  cleanup: {
    enabled: boolean
    lastRunAt: string | null
    lastRunStatus: string | null
    lastRunMessage: string | null
    keepFullCount: number
    keepDiffPerFull: number
  }
}

interface CleanupStatus {
  analysis: CleanupAnalysis
}

export default function LocalStoragePage() {
  const [data, setData] = useState<LocalStorageData | null>(null)
  const [cleanupAnalysis, setCleanupAnalysis] = useState<CleanupAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [running, setRunning] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch("/api/local-storage")
      if (!res.ok) throw new Error("Failed to fetch")
      const result = await res.json()
      setData(result)

      // Also fetch cleanup analysis
      const cleanupRes = await fetch("/api/cleanup")
      if (cleanupRes.ok) {
        const cleanupData: CleanupStatus = await cleanupRes.json()
        setCleanupAnalysis(cleanupData.analysis)
      }
    } catch (error) {
      console.error("Failed to fetch:", error)
      toast.error("Failed to load local storage data")
    } finally {
      setLoading(false)
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

      // Refresh cleanup analysis
      const cleanupRes = await fetch("/api/cleanup")
      if (cleanupRes.ok) {
        const cleanupData: CleanupStatus = await cleanupRes.json()
        setCleanupAnalysis(cleanupData.analysis)
      }

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

      await fetchData()
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
    return new Date(dateStr).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  function getBackupTypeColor(type: string) {
    switch (type) {
      case "FULL": return "bg-blue-500"
      case "DIFF": return "bg-green-500"
      case "LOG": return "bg-purple-500"
      default: return "bg-gray-500"
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Failed to load local storage data
        </CardContent>
      </Card>
    )
  }

  const totalCapacity = data.totalSizeMb > 0 ? data.totalSizeMb : 1
  const fullPercent = (data.fullSizeMb / totalCapacity) * 100
  const diffPercent = (data.diffSizeMb / totalCapacity) * 100
  const logPercent = (data.logSizeMb / totalCapacity) * 100

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Local Storage</h1>
          <p className="text-muted-foreground">Manage local backup files</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Folder Path */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <code className="text-sm bg-muted px-2 py-1 rounded">{data.path}</code>
            {data.exists ? (
              <Badge variant="outline" className="border-green-500 text-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                Available
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Not Found
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {!data.exists ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Backup folder not found</p>
            <p className="text-muted-foreground">
              The backup folder does not exist. Configure it in Settings.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Overview Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Files</p>
                    <p className="text-3xl font-bold">{data.totalFiles}</p>
                  </div>
                  <FileArchive className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Size</p>
                    <p className="text-3xl font-bold">{formatSize(data.totalSizeMb)}</p>
                  </div>
                  <HardDrive className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">FULL Backups</p>
                    <p className="text-3xl font-bold text-blue-600">{data.fullBackups}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(data.fullSizeMb)}</p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-600">F</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">DIFF Backups</p>
                    <p className="text-3xl font-bold text-green-600">{data.diffBackups}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(data.diffSizeMb)}</p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-green-600">D</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Databases</p>
                    <p className="text-3xl font-bold">{data.databaseCount}</p>
                  </div>
                  <Database className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Storage Distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <HardDrive className="h-5 w-5" />
                Storage Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-6 bg-muted rounded-full overflow-hidden flex">
                <div
                  className="bg-blue-500 transition-all"
                  style={{ width: `${fullPercent}%` }}
                  title={`FULL: ${formatSize(data.fullSizeMb)}`}
                />
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: `${diffPercent}%` }}
                  title={`DIFF: ${formatSize(data.diffSizeMb)}`}
                />
                <div
                  className="bg-purple-500 transition-all"
                  style={{ width: `${logPercent}%` }}
                  title={`LOG: ${formatSize(data.logSizeMb)}`}
                />
              </div>
              <div className="flex justify-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span>FULL ({formatSize(data.fullSizeMb)})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span>DIFF ({formatSize(data.diffSizeMb)})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-purple-500" />
                  <span>LOG ({formatSize(data.logSizeMb)})</span>
                </div>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground pt-2 border-t">
                <span>Oldest: {formatDate(data.oldestBackup)}</span>
                <span>Newest: {formatDate(data.newestBackup)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Cleanup Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Cleanup Actions
              </CardTitle>
              <CardDescription>
                Analyze or run cleanup manually
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Cleanup Status */}
              {data.cleanup.lastRunAt && (
                <div className="p-4 bg-muted rounded-lg flex items-center gap-4">
                  {data.cleanup.lastRunStatus === "success" ? (
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500" />
                  )}
                  <div>
                    <p className="font-medium">{data.cleanup.lastRunMessage}</p>
                    <p className="text-sm text-muted-foreground">
                      Last run: {formatDate(data.cleanup.lastRunAt)}
                    </p>
                  </div>
                </div>
              )}

              {/* Retention Policy Display */}
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">Current Retention Policy</h4>
                <p className="text-sm text-muted-foreground">
                  Keep <span className="font-medium">{data.cleanup.keepFullCount} FULL</span> backups per database,
                  and <span className="font-medium">{data.cleanup.keepDiffPerFull} DIFF</span> per FULL.
                  {!data.cleanup.enabled && (
                    <span className="text-yellow-600 ml-2">(Auto cleanup disabled)</span>
                  )}
                </p>
              </div>

              {/* Cleanup Preview */}
              {cleanupAnalysis && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 text-green-600 mb-2">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">Files to Keep</span>
                    </div>
                    <p className="text-2xl font-bold">{cleanupAnalysis.filesToKeep.length}</p>
                    <p className="text-sm text-muted-foreground">{formatSize(cleanupAnalysis.keepSizeMb)}</p>
                  </div>
                  <div className={`p-4 border rounded-lg ${cleanupAnalysis.filesToDelete.length > 0 ? "border-orange-200 bg-orange-50 dark:bg-orange-950/20" : ""}`}>
                    <div className="flex items-center gap-2 text-orange-600 mb-2">
                      <Trash2 className="h-5 w-5" />
                      <span className="font-medium">Files to Delete</span>
                    </div>
                    <p className="text-2xl font-bold">{cleanupAnalysis.filesToDelete.length}</p>
                    <p className="text-sm text-muted-foreground">{formatSize(cleanupAnalysis.deleteSizeMb)}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
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
                  disabled={running || (cleanupAnalysis?.filesToDelete.length || 0) === 0}
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
              </div>

              {(cleanupAnalysis?.filesToDelete.length || 0) === 0 && (
                <p className="text-sm text-muted-foreground">
                  No files to delete based on current retention policy.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Files to Delete Preview */}
          {showAnalysis && cleanupAnalysis && cleanupAnalysis.filesToDelete.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Files to Delete ({cleanupAnalysis.filesToDelete.length})
                </CardTitle>
                <CardDescription>
                  Total size: {formatSize(cleanupAnalysis.deleteSizeMb)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Group by database */}
                  {Object.entries(cleanupAnalysis.byDatabase)
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
                    {cleanupAnalysis.filesToDelete.slice(0, 50).map((file, i) => (
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
                    {cleanupAnalysis.filesToDelete.length > 50 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        ... and {cleanupAnalysis.filesToDelete.length - 50} more files
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Databases List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Databases ({data.databaseCount})
              </CardTitle>
              <CardDescription>
                Backup files by database
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.databases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No backup files found
                </p>
              ) : (
                <div className="space-y-2">
                  {data.databases.map(db => (
                    <div key={db.name} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{db.name}</span>
                        </div>
                        <span className="text-sm font-medium">{formatSize(db.totalSizeMb)}</span>
                      </div>
                      <div className="flex gap-2 text-sm">
                        <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                          {db.fullCount} FULL
                        </Badge>
                        <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                          {db.diffCount} DIFF
                        </Badge>
                        {db.logCount > 0 && (
                          <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">
                            {db.logCount} LOG
                          </Badge>
                        )}
                        {db.lastBackup && (
                          <span className="text-muted-foreground ml-auto">
                            Last: {formatDate(db.lastBackup)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Backups */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Recent Backups
              </CardTitle>
              <CardDescription>
                Last 20 backup files
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentBackups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No backup files found
                </p>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {data.recentBackups.map((file, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 hover:bg-muted rounded text-sm">
                      <div className={`h-2 w-2 rounded-full ${getBackupTypeColor(file.backupType)}`} />
                      <Badge variant="outline" className="w-12 justify-center">{file.backupType}</Badge>
                      <span className="font-medium truncate flex-1">{file.databaseName}</span>
                      <span className="text-muted-foreground">{formatDate(file.date)}</span>
                      <span className="text-muted-foreground w-24 text-right">{formatSize(file.sizeMb)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run Cleanup Now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {cleanupAnalysis?.filesToDelete.length} backup files
              ({formatSize(cleanupAnalysis?.deleteSizeMb || 0)}).
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
