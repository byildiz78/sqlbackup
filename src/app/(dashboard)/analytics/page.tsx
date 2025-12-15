"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  HardDriveDownload,
  Wrench,
  Cloud,
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  Activity,
  Timer,
  Database,
  Server,
  Trash2
} from "lucide-react"

interface TimelineItem {
  id: string
  type: "backup" | "maintenance" | "borg" | "cleanup"
  subType: string
  databaseName: string | null
  serverName: string | null
  startedAt: string
  completedAt: string | null
  status: string
  duration: number | null
  sizeMb: number | null
  filesDeleted?: number | null
  errorMsg: string | null
}

interface AnalyticsData {
  date: string
  summary: {
    backup: {
      total: number
      success: number
      failed: number
      running: number
      totalSizeMb: number
      totalDuration: number
      byType: { FULL: number; DIFF: number; LOG: number }
    }
    maintenance: {
      total: number
      success: number
      failed: number
      running: number
      totalDuration: number
      byType: { INDEX: number; INTEGRITY: number; STATS: number }
    }
    borg: {
      total: number
      success: number
      failed: number
      running: number
      totalDuration: number
      totalSizeOriginalMb: number
      totalSizeDeduplicatedMb: number
    }
    cleanup: {
      total: number
      success: number
      failed: number
      running: number
      totalDuration: number
      totalFilesDeleted: number
      totalSizeFreedMb: number
      dryRuns: number
    }
    overall: {
      total: number
      success: number
      failed: number
      running: number
    }
    timeRange: {
      firstJobAt: string | null
      lastJobAt: string | null
    }
  }
  timeline: TimelineItem[]
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => {
    // Default to today (jobs run at night, so today's date)
    const today = new Date()
    return today.toISOString().split("T")[0]
  })

  useEffect(() => {
    fetchData()
  }, [selectedDate])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics/daily?date=${selectedDate}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const result = await res.json()
      setData(result)
    } catch {
      toast.error("Failed to fetch analytics data")
    } finally {
      setLoading(false)
    }
  }

  function goToPreviousDay() {
    const current = new Date(selectedDate)
    current.setDate(current.getDate() - 1)
    setSelectedDate(current.toISOString().split("T")[0])
  }

  function goToNextDay() {
    const current = new Date(selectedDate)
    current.setDate(current.getDate() + 1)
    const today = new Date()
    if (current <= today) {
      setSelectedDate(current.toISOString().split("T")[0])
    }
  }

  function goToToday() {
    const today = new Date()
    setSelectedDate(today.toISOString().split("T")[0])
  }

  function formatDuration(seconds: number | null) {
    if (seconds === null || seconds === undefined) return "-"
    if (seconds === 0) return "<1s"
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins < 60) return `${mins}m ${secs}s`
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}h ${remainingMins}m`
  }

  function formatSize(sizeMb: number | null) {
    if (sizeMb === null || sizeMb === undefined) return "-"
    if (sizeMb < 1024) return `${sizeMb.toFixed(1)} MB`
    return `${(sizeMb / 1024).toFixed(2)} GB`
  }

  function formatTime(dateStr: string | null) {
    if (!dateStr) return "-"
    return new Date(dateStr).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  }

  function formatDateTime(dateStr: string | null) {
    if (!dateStr) return "-"
    return new Date(dateStr).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case "backup":
        return <HardDriveDownload className="h-4 w-4 text-blue-500" />
      case "maintenance":
        return <Wrench className="h-4 w-4 text-purple-500" />
      case "borg":
        return <Cloud className="h-4 w-4 text-orange-500" />
      case "cleanup":
        return <Trash2 className="h-4 w-4 text-rose-500" />
      default:
        return null
    }
  }

  function getTypeBadgeVariant(type: string): "default" | "secondary" | "outline" | "destructive" {
    switch (type) {
      case "backup":
        return "default"
      case "maintenance":
        return "secondary"
      case "borg":
        return "outline"
      case "cleanup":
        return "destructive"
      default:
        return "outline"
    }
  }

  const isToday = selectedDate === new Date().toISOString().split("T")[0]
  const displayDate = new Date(selectedDate).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  })

  // Group timeline by server
  const timelineByServer = data?.timeline.reduce((acc, item) => {
    let key = item.serverName || "Storage Sync"
    if (item.type === "cleanup") key = "Disk Cleanup"
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<string, TimelineItem[]>) || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Daily Analytics</h1>
          <p className="text-muted-foreground">Backup, maintenance and sync operations overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" size="icon" onClick={goToNextDay} disabled={isToday}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>
      </div>

      <p className="text-lg font-medium text-center text-muted-foreground">{displayDate}</p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Failed to load analytics data
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Overall Summary */}
          <div className="grid grid-cols-4 gap-4">
            <Card className={data.summary.overall.failed > 0 ? "border-red-200 bg-red-50 dark:bg-red-950/20" : ""}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Jobs</p>
                    <p className="text-3xl font-bold">{data.summary.overall.total}</p>
                  </div>
                  <Activity className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Successful</p>
                    <p className="text-3xl font-bold text-green-600">{data.summary.overall.success}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card className={data.summary.overall.failed > 0 ? "border-red-300 bg-red-100 dark:bg-red-950/30" : ""}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Failed</p>
                    <p className={`text-3xl font-bold ${data.summary.overall.failed > 0 ? "text-red-600" : ""}`}>
                      {data.summary.overall.failed}
                    </p>
                  </div>
                  <XCircle className={`h-8 w-8 ${data.summary.overall.failed > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Time Range</p>
                    <p className="text-lg font-medium">
                      {formatTime(data.summary.timeRange.firstJobAt)} - {formatTime(data.summary.timeRange.lastJobAt)}
                    </p>
                  </div>
                  <Timer className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Backup Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <HardDriveDownload className="h-5 w-5 text-blue-500" />
                  Backup Jobs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-muted rounded">
                    <p className="text-2xl font-bold text-green-600">{data.summary.backup.success}</p>
                    <p className="text-xs text-muted-foreground">Success</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className={`text-2xl font-bold ${data.summary.backup.failed > 0 ? "text-red-600" : ""}`}>
                      {data.summary.backup.failed}
                    </p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="text-2xl font-bold">{data.summary.backup.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Types:</span>
                  <span>
                    <Badge variant="default" className="mr-1">{data.summary.backup.byType.FULL} FULL</Badge>
                    <Badge variant="secondary">{data.summary.backup.byType.DIFF} DIFF</Badge>
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Size:</span>
                  <span className="font-medium">{formatSize(data.summary.backup.totalSizeMb)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Duration:</span>
                  <span className="font-medium">{formatDuration(data.summary.backup.totalDuration)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Maintenance Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Wrench className="h-5 w-5 text-purple-500" />
                  Maintenance Jobs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-muted rounded">
                    <p className="text-2xl font-bold text-green-600">{data.summary.maintenance.success}</p>
                    <p className="text-xs text-muted-foreground">Success</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className={`text-2xl font-bold ${data.summary.maintenance.failed > 0 ? "text-red-600" : ""}`}>
                      {data.summary.maintenance.failed}
                    </p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="text-2xl font-bold">{data.summary.maintenance.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Types:</span>
                  <span>
                    <Badge variant="outline" className="mr-1">{data.summary.maintenance.byType.INDEX} INDEX</Badge>
                    <Badge variant="outline">{data.summary.maintenance.byType.INTEGRITY} INTEGRITY</Badge>
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Duration:</span>
                  <span className="font-medium">{formatDuration(data.summary.maintenance.totalDuration)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Borg Sync Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Cloud className="h-5 w-5 text-orange-500" />
                  StorageBox Sync
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-muted rounded">
                    <p className="text-2xl font-bold text-green-600">{data.summary.borg.success}</p>
                    <p className="text-xs text-muted-foreground">Success</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className={`text-2xl font-bold ${data.summary.borg.failed > 0 ? "text-red-600" : ""}`}>
                      {data.summary.borg.failed}
                    </p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="text-2xl font-bold">{data.summary.borg.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Original Size:</span>
                  <span className="font-medium">{formatSize(data.summary.borg.totalSizeOriginalMb)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Deduplicated:</span>
                  <span className="font-medium">{formatSize(data.summary.borg.totalSizeDeduplicatedMb)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Duration:</span>
                  <span className="font-medium">{formatDuration(data.summary.borg.totalDuration)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Cleanup Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Trash2 className="h-5 w-5 text-rose-500" />
                  Disk Cleanup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-muted rounded">
                    <p className="text-2xl font-bold text-green-600">{data.summary.cleanup?.success || 0}</p>
                    <p className="text-xs text-muted-foreground">Success</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className={`text-2xl font-bold ${(data.summary.cleanup?.failed || 0) > 0 ? "text-red-600" : ""}`}>
                      {data.summary.cleanup?.failed || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="text-2xl font-bold">{data.summary.cleanup?.total || 0}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Files Deleted:</span>
                  <span className="font-medium">{data.summary.cleanup?.totalFilesDeleted || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Space Freed:</span>
                  <span className="font-medium">{formatSize(data.summary.cleanup?.totalSizeFreedMb || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dry Runs:</span>
                  <span className="font-medium">{data.summary.cleanup?.dryRuns || 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Failed Jobs Alert */}
          {data.summary.overall.failed > 0 && (
            <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                  Failed Jobs ({data.summary.overall.failed})
                </CardTitle>
                <CardDescription className="text-red-600 dark:text-red-400">
                  The following jobs failed and require attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.timeline
                    .filter(item => item.status === "failed")
                    .map(item => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 bg-white dark:bg-background rounded-lg border border-red-200"
                      >
                        <div className="flex items-center gap-3">
                          {getTypeIcon(item.type)}
                          <div>
                            <p className="font-medium">
                              {item.databaseName || (item.type === "cleanup" ? "Disk Cleanup" : "Borg Sync")}
                              {item.serverName && (
                                <span className="text-muted-foreground ml-2 text-sm">({item.serverName})</span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {item.subType} - {formatTime(item.startedAt)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-red-600 max-w-xs truncate">{item.errorMsg || "Unknown error"}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timeline by Server */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Job Timeline
              </CardTitle>
              <CardDescription>
                All jobs executed on {displayDate}, grouped by server
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.timeline.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No jobs were executed on this date
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(timelineByServer).map(([serverName, items]) => (
                    <div key={serverName} className="space-y-2">
                      <div className="flex items-center gap-2 pb-2 border-b">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold">{serverName}</h3>
                        <Badge variant="secondary" className="ml-auto">{items.length} jobs</Badge>
                      </div>
                      <div className="grid gap-2">
                        {items.map(item => (
                          <div
                            key={item.id}
                            className={`flex items-center gap-4 p-3 rounded-lg border ${
                              item.status === "failed"
                                ? "border-red-200 bg-red-50 dark:bg-red-950/20"
                                : item.status === "running"
                                ? "border-blue-200 bg-blue-50 dark:bg-blue-950/20"
                                : "border-muted bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center gap-2 w-20">
                              {getStatusIcon(item.status)}
                              <span className="text-sm font-mono">{formatTime(item.startedAt)}</span>
                            </div>

                            <div className="flex items-center gap-2 min-w-32">
                              {getTypeIcon(item.type)}
                              <Badge variant={getTypeBadgeVariant(item.type)}>{item.subType}</Badge>
                            </div>

                            <div className="flex-1">
                              {item.databaseName ? (
                                <div className="flex items-center gap-2">
                                  <Database className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium">{item.databaseName}</span>
                                </div>
                              ) : item.type === "cleanup" ? (
                                <div className="flex items-center gap-2">
                                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium">Disk Cleanup</span>
                                  {item.filesDeleted !== null && item.filesDeleted !== undefined && (
                                    <span className="text-sm text-muted-foreground">({item.filesDeleted} files)</span>
                                  )}
                                </div>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              {item.duration !== null && (
                                <span className="flex items-center gap-1">
                                  <Timer className="h-3 w-3" />
                                  {formatDuration(item.duration)}
                                </span>
                              )}
                              {item.sizeMb !== null && item.sizeMb > 0 && (
                                <span>{formatSize(item.sizeMb)}{item.type === "cleanup" ? " freed" : ""}</span>
                              )}
                              {item.completedAt && (
                                <span className="font-mono">{formatTime(item.completedAt)}</span>
                              )}
                            </div>

                            {item.status === "failed" && item.errorMsg && (
                              <div className="w-48 truncate text-sm text-red-600" title={item.errorMsg}>
                                {item.errorMsg}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
