"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import {
  Database,
  Calendar,
  HardDrive,
  AlertTriangle,
  CheckCircle,
  Filter,
  XCircle,
  X,
  Loader2,
  HardDriveDownload,
  Wrench,
  Clock,
  BarChart3,
  Shield,
  Zap
} from "lucide-react"
import { DataTable, Column } from "@/components/data-table"

interface DatabaseItem {
  id: string
  name: string
  sizeMb: number | null
  status: string
  lastBackupFull: string | null
  lastBackupDiff: string | null
  server: {
    id: string
    name: string
    host: string
  }
  _count: {
    backupJobs: number
  }
  // Job status flags
  hasFullBackup: boolean
  hasDiffBackup: boolean
  hasLogBackup: boolean
  hasIndexMaintenance: boolean
  hasIntegrityCheck: boolean
}

type JobFilter = "all" | "no-full" | "no-diff" | "no-backup" | "no-maintenance" | "complete"

interface SqlServer {
  id: string
  name: string
}

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<DatabaseItem[]>([])
  const [servers, setServers] = useState<SqlServer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedServer, setSelectedServer] = useState<string>("all")
  const [jobFilter, setJobFilter] = useState<JobFilter>("all")

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Quick job modal state
  const [quickJobModal, setQuickJobModal] = useState<"backup" | "maintenance" | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Backup job settings
  const [backupType, setBackupType] = useState<"FULL" | "DIFF">("FULL")
  const [backupSchedule, setBackupSchedule] = useState("0 2 * * *")
  const [backupRetention, setBackupRetention] = useState(30)

  // Maintenance job settings
  const [maintenanceType, setMaintenanceType] = useState<"INDEX" | "INTEGRITY" | "STATS">("INDEX")
  const [maintenanceSchedule, setMaintenanceSchedule] = useState("0 2 * * 0")
  const [fragmentationLevel1, setFragmentationLevel1] = useState(5)
  const [fragmentationLevel2, setFragmentationLevel2] = useState(30)

  useEffect(() => {
    fetchServers()
    fetchDatabases()
  }, [])

  useEffect(() => {
    fetchDatabases()
  }, [selectedServer])

  async function fetchServers() {
    try {
      const res = await fetch("/api/servers")
      const data = await res.json()
      setServers(data)
    } catch (error) {
      console.error("Failed to fetch servers:", error)
    }
  }

  async function fetchDatabases() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedServer && selectedServer !== "all") {
        params.set("serverId", selectedServer)
      }

      const res = await fetch(`/api/databases?${params}`)
      const data = await res.json()
      setDatabases(data)
    } catch (error) {
      console.error("Failed to fetch databases:", error)
    } finally {
      setLoading(false)
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never"
    return new Date(dateStr).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function formatSize(sizeMb: number | null) {
    if (sizeMb === null) return "N/A"
    if (sizeMb < 1024) return `${sizeMb.toFixed(2)} MB`
    return `${(sizeMb / 1024).toFixed(2)} GB`
  }

  function getBackupStatus(lastBackup: string | null) {
    if (!lastBackup) return { variant: "destructive" as const, text: "No Backup" }
    const daysSince = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince > 7) return { variant: "destructive" as const, text: `${daysSince}d ago` }
    if (daysSince > 1) return { variant: "secondary" as const, text: `${daysSince}d ago` }
    return { variant: "default" as const, text: "Recent" }
  }

  // Selection functions
  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredDatabases.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDatabases.map(db => db.id)))
    }
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  // Get selected databases info
  const selectedDatabases = useMemo(() => {
    return databases.filter(db => selectedIds.has(db.id))
  }, [databases, selectedIds])

  // Quick job creation handlers
  async function handleCreateBackupJobs() {
    if (selectedIds.size === 0) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/backups/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseIds: Array.from(selectedIds),
          backupType,
          scheduleType: "daily",
          startHour: parseInt(backupSchedule.split(" ")[1]) || 2,
          windowHours: 6,
          storageTarget: "default",
          compression: true,
          checksum: true,
          retentionDays: backupRetention
        })
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Failed to create backup jobs")
        return
      }

      toast.success(`Created ${data.summary.created} backup jobs (${data.summary.skipped} skipped)`)
      setQuickJobModal(null)
      clearSelection()
      fetchDatabases()
    } catch {
      toast.error("Failed to create backup jobs")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateMaintenanceJobs() {
    if (selectedIds.size === 0) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/maintenance/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseIds: Array.from(selectedIds),
          maintenanceType,
          scheduleType: "weekly",
          startHour: parseInt(maintenanceSchedule.split(" ")[1]) || 2,
          windowHours: 6,
          weekDay: 0,
          options: maintenanceType === "INDEX" ? {
            fragmentationLevel1,
            fragmentationLevel2
          } : undefined
        })
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Failed to create maintenance jobs")
        return
      }

      toast.success(`Created ${data.summary.created} maintenance jobs (${data.summary.skipped} skipped)`)
      setQuickJobModal(null)
      clearSelection()
      fetchDatabases()
    } catch {
      toast.error("Failed to create maintenance jobs")
    } finally {
      setSubmitting(false)
    }
  }

  // Filter databases based on job filter
  const filteredDatabases = useMemo(() => {
    return databases.filter(db => {
      switch (jobFilter) {
        case "no-full":
          return !db.hasFullBackup
        case "no-diff":
          return !db.hasDiffBackup
        case "no-backup":
          return !db.hasFullBackup && !db.hasDiffBackup
        case "no-maintenance":
          return !db.hasIndexMaintenance && !db.hasIntegrityCheck
        case "complete":
          return db.hasFullBackup && db.hasDiffBackup && db.hasIndexMaintenance
        default:
          return true
      }
    })
  }, [databases, jobFilter])

  // Count databases missing jobs
  const stats = useMemo(() => {
    return {
      total: databases.length,
      noFull: databases.filter(db => !db.hasFullBackup).length,
      noDiff: databases.filter(db => !db.hasDiffBackup).length,
      noBackup: databases.filter(db => !db.hasFullBackup && !db.hasDiffBackup).length,
      noMaintenance: databases.filter(db => !db.hasIndexMaintenance && !db.hasIntegrityCheck).length,
      complete: databases.filter(db => db.hasFullBackup && db.hasDiffBackup && db.hasIndexMaintenance).length
    }
  }, [databases])

  const columns: Column<DatabaseItem>[] = useMemo(() => [
    {
      key: "select",
      header: () => (
        <Checkbox
          checked={selectedIds.size > 0 && selectedIds.size === filteredDatabases.length}
          onCheckedChange={toggleSelectAll}
          aria-label="Select all"
        />
      ),
      sortable: false,
      searchable: false,
      className: "w-[40px]",
      cell: (db) => (
        <Checkbox
          checked={selectedIds.has(db.id)}
          onCheckedChange={() => toggleSelection(db.id)}
          aria-label={`Select ${db.name}`}
          onClick={(e) => e.stopPropagation()}
        />
      )
    },
    {
      key: "name",
      header: "Database",
      cell: (db) => (
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-blue-500" />
          <span className="font-medium">{db.name}</span>
        </div>
      )
    },
    {
      key: "server.name",
      header: "Server",
      cell: (db) => <span className="text-muted-foreground">{db.server.name}</span>
    },
    {
      key: "sizeMb",
      header: "Size",
      sortValue: (db) => db.sizeMb || 0,
      cell: (db) => (
        <div className="flex items-center gap-1">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          {formatSize(db.sizeMb)}
        </div>
      )
    },
    {
      key: "lastBackupFull",
      header: "Last Full Backup",
      sortValue: (db) => db.lastBackupFull ? new Date(db.lastBackupFull).getTime() : 0,
      cell: (db) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{formatDate(db.lastBackupFull)}</span>
        </div>
      )
    },
    {
      key: "lastBackupDiff",
      header: "Last Diff Backup",
      sortValue: (db) => db.lastBackupDiff ? new Date(db.lastBackupDiff).getTime() : 0,
      cell: (db) => formatDate(db.lastBackupDiff)
    },
    {
      key: "jobStatus",
      header: "Configured Jobs",
      sortable: false,
      searchable: false,
      cell: (db) => (
        <div className="flex flex-wrap gap-1">
          {db.hasFullBackup ? (
            <Badge variant="default" className="text-xs">FULL</Badge>
          ) : (
            <Badge variant="outline" className="text-xs border-red-300 text-red-600 bg-red-50">
              <XCircle className="h-3 w-3 mr-1" />
              FULL
            </Badge>
          )}
          {db.hasDiffBackup ? (
            <Badge variant="default" className="text-xs">DIFF</Badge>
          ) : (
            <Badge variant="outline" className="text-xs border-orange-300 text-orange-600 bg-orange-50">
              <XCircle className="h-3 w-3 mr-1" />
              DIFF
            </Badge>
          )}
          {db.hasLogBackup && (
            <Badge variant="secondary" className="text-xs">LOG</Badge>
          )}
        </div>
      )
    },
    {
      key: "maintenanceStatus",
      header: "Maintenance",
      sortable: false,
      searchable: false,
      cell: (db) => (
        <div className="flex flex-wrap gap-1">
          {db.hasIndexMaintenance ? (
            <Badge variant="secondary" className="text-xs">INDEX</Badge>
          ) : (
            <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-700 bg-yellow-50">
              <AlertTriangle className="h-3 w-3 mr-1" />
              INDEX
            </Badge>
          )}
          {db.hasIntegrityCheck && (
            <Badge variant="secondary" className="text-xs">INTEGRITY</Badge>
          )}
        </div>
      )
    },
    {
      key: "backupStatus",
      header: "Last Backup",
      sortable: false,
      cell: (db) => {
        const backupStatus = getBackupStatus(db.lastBackupFull)
        return <Badge variant={backupStatus.variant}>{backupStatus.text}</Badge>
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [selectedIds, filteredDatabases.length])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Databases</h1>
          <p className="text-muted-foreground">View and manage all databases across your servers</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedServer} onValueChange={setSelectedServer}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Servers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Servers</SelectItem>
              {servers.map((server) => (
                <SelectItem key={server.id} value={server.id}>
                  {server.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Job Status Summary */}
      {databases.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <button
            onClick={() => setJobFilter(jobFilter === "no-full" ? "all" : "no-full")}
            className={`p-3 rounded-lg border text-left transition-all ${
              jobFilter === "no-full"
                ? "border-red-500 bg-red-50 dark:bg-red-950"
                : "border-muted hover:border-red-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <XCircle className={`h-4 w-4 ${stats.noFull > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">No Full Backup</span>
            </div>
            <p className={`text-2xl font-bold mt-1 ${stats.noFull > 0 ? "text-red-600" : "text-muted-foreground"}`}>
              {stats.noFull}
            </p>
          </button>

          <button
            onClick={() => setJobFilter(jobFilter === "no-diff" ? "all" : "no-diff")}
            className={`p-3 rounded-lg border text-left transition-all ${
              jobFilter === "no-diff"
                ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                : "border-muted hover:border-orange-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <XCircle className={`h-4 w-4 ${stats.noDiff > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">No Diff Backup</span>
            </div>
            <p className={`text-2xl font-bold mt-1 ${stats.noDiff > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
              {stats.noDiff}
            </p>
          </button>

          <button
            onClick={() => setJobFilter(jobFilter === "no-backup" ? "all" : "no-backup")}
            className={`p-3 rounded-lg border text-left transition-all ${
              jobFilter === "no-backup"
                ? "border-red-500 bg-red-50 dark:bg-red-950"
                : "border-muted hover:border-red-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${stats.noBackup > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">No Backup Jobs</span>
            </div>
            <p className={`text-2xl font-bold mt-1 ${stats.noBackup > 0 ? "text-red-600" : "text-muted-foreground"}`}>
              {stats.noBackup}
            </p>
          </button>

          <button
            onClick={() => setJobFilter(jobFilter === "no-maintenance" ? "all" : "no-maintenance")}
            className={`p-3 rounded-lg border text-left transition-all ${
              jobFilter === "no-maintenance"
                ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
                : "border-muted hover:border-yellow-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${stats.noMaintenance > 0 ? "text-yellow-600" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">No Maintenance</span>
            </div>
            <p className={`text-2xl font-bold mt-1 ${stats.noMaintenance > 0 ? "text-yellow-600" : "text-muted-foreground"}`}>
              {stats.noMaintenance}
            </p>
          </button>

          <button
            onClick={() => setJobFilter(jobFilter === "complete" ? "all" : "complete")}
            className={`p-3 rounded-lg border text-left transition-all ${
              jobFilter === "complete"
                ? "border-green-500 bg-green-50 dark:bg-green-950"
                : "border-muted hover:border-green-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Fully Configured</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">
              {stats.complete}
            </p>
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {jobFilter === "all" ? "All Databases" :
                 jobFilter === "no-full" ? "Databases Without Full Backup Job" :
                 jobFilter === "no-diff" ? "Databases Without Diff Backup Job" :
                 jobFilter === "no-backup" ? "Databases Without Any Backup Job" :
                 jobFilter === "no-maintenance" ? "Databases Without Maintenance Job" :
                 "Fully Configured Databases"}
              </CardTitle>
              <CardDescription>
                {filteredDatabases.length} database{filteredDatabases.length !== 1 ? "s" : ""}
                {jobFilter !== "all" && ` (filtered from ${databases.length} total)`}
              </CardDescription>
            </div>
            {jobFilter !== "all" && (
              <Button variant="outline" size="sm" onClick={() => setJobFilter("all")}>
                <Filter className="h-4 w-4 mr-2" />
                Clear Filter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            data={filteredDatabases}
            columns={columns}
            loading={loading}
            searchPlaceholder="Search databases..."
            emptyMessage={
              jobFilter !== "all"
                ? "No databases match the current filter."
                : "No databases found. Add a SQL Server and sync its databases."
            }
            pageSize={25}
            pageSizeOptions={[10, 25, 50, 100, 200]}
          />
        </CardContent>
      </Card>

      {/* Floating Action Bar - appears when databases are selected */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {selectedIds.size}
            </Badge>
            <span className="text-sm text-muted-foreground">database(s) selected</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => setQuickJobModal("backup")}
            >
              <HardDriveDownload className="h-4 w-4 mr-2" />
              Create Backup Jobs
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setQuickJobModal("maintenance")}
            >
              <Wrench className="h-4 w-4 mr-2" />
              Create Maintenance Jobs
            </Button>
          </div>
          <div className="h-6 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            <X className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      )}

      {/* Quick Backup Job Modal */}
      {quickJobModal === "backup" && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setQuickJobModal(null)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border rounded-lg shadow-lg w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <HardDriveDownload className="h-5 w-5 text-blue-500" />
                  Quick Backup Job Creation
                </h2>
                <p className="text-sm text-muted-foreground">
                  Create backup jobs for {selectedIds.size} selected database(s)
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setQuickJobModal(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {/* Selected Databases Preview */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Selected Databases:</p>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {selectedDatabases.slice(0, 10).map(db => (
                    <Badge key={db.id} variant="outline" className="text-xs">
                      {db.name}
                    </Badge>
                  ))}
                  {selectedDatabases.length > 10 && (
                    <Badge variant="secondary" className="text-xs">
                      +{selectedDatabases.length - 10} more
                    </Badge>
                  )}
                </div>
              </div>

              {/* Backup Type Selection */}
              <div className="space-y-2">
                <Label>Backup Type</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBackupType("FULL")}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      backupType === "FULL"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                        : "border-muted hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <HardDriveDownload className="h-5 w-5 text-blue-500" />
                      <span className="font-medium">Full Backup</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Complete database backup</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackupType("DIFF")}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      backupType === "DIFF"
                        ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                        : "border-muted hover:border-orange-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 className="h-5 w-5 text-orange-500" />
                      <span className="font-medium">Diff Backup</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Changes since last full</p>
                  </button>
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <Label>Schedule</Label>
                <Select value={backupSchedule} onValueChange={setBackupSchedule}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0 2 * * *">Daily at 02:00</SelectItem>
                    <SelectItem value="0 3 * * *">Daily at 03:00</SelectItem>
                    <SelectItem value="0 4 * * *">Daily at 04:00</SelectItem>
                    <SelectItem value="0 22 * * *">Daily at 22:00</SelectItem>
                    <SelectItem value="0 23 * * *">Daily at 23:00</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Jobs will be staggered across a 6-hour window
                </p>
              </div>

              {/* Retention */}
              <div className="space-y-2">
                <Label>Retention (days)</Label>
                <Select value={backupRetention.toString()} onValueChange={(v) => setBackupRetention(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setQuickJobModal(null)}>
                Cancel
              </Button>
              <Button onClick={handleCreateBackupJobs} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Create {selectedIds.size} Jobs
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Quick Maintenance Job Modal */}
      {quickJobModal === "maintenance" && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setQuickJobModal(null)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border rounded-lg shadow-lg w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-purple-500" />
                  Quick Maintenance Job Creation
                </h2>
                <p className="text-sm text-muted-foreground">
                  Create maintenance jobs for {selectedIds.size} selected database(s)
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setQuickJobModal(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {/* Selected Databases Preview */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Selected Databases:</p>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {selectedDatabases.slice(0, 10).map(db => (
                    <Badge key={db.id} variant="outline" className="text-xs">
                      {db.name}
                    </Badge>
                  ))}
                  {selectedDatabases.length > 10 && (
                    <Badge variant="secondary" className="text-xs">
                      +{selectedDatabases.length - 10} more
                    </Badge>
                  )}
                </div>
              </div>

              {/* Maintenance Type Selection */}
              <div className="space-y-2">
                <Label>Maintenance Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setMaintenanceType("INDEX")}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${
                      maintenanceType === "INDEX"
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-950"
                        : "border-muted hover:border-purple-300"
                    }`}
                  >
                    <BarChart3 className="h-5 w-5 mx-auto text-purple-500 mb-1" />
                    <span className="text-sm font-medium">Index</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaintenanceType("INTEGRITY")}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${
                      maintenanceType === "INTEGRITY"
                        ? "border-green-500 bg-green-50 dark:bg-green-950"
                        : "border-muted hover:border-green-300"
                    }`}
                  >
                    <Shield className="h-5 w-5 mx-auto text-green-500 mb-1" />
                    <span className="text-sm font-medium">Integrity</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaintenanceType("STATS")}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${
                      maintenanceType === "STATS"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                        : "border-muted hover:border-blue-300"
                    }`}
                  >
                    <Wrench className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                    <span className="text-sm font-medium">Statistics</span>
                  </button>
                </div>
              </div>

              {/* Index Options */}
              {maintenanceType === "INDEX" && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">Reorganize threshold</Label>
                      <span className="text-xs text-muted-foreground">{fragmentationLevel1}%</span>
                    </div>
                    <Slider
                      value={[fragmentationLevel1]}
                      onValueChange={(v) => setFragmentationLevel1(v[0])}
                      min={1}
                      max={50}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">Rebuild threshold</Label>
                      <span className="text-xs text-muted-foreground">{fragmentationLevel2}%</span>
                    </div>
                    <Slider
                      value={[fragmentationLevel2]}
                      onValueChange={(v) => setFragmentationLevel2(v[0])}
                      min={10}
                      max={100}
                      step={5}
                    />
                  </div>
                </div>
              )}

              {/* Schedule */}
              <div className="space-y-2">
                <Label>Schedule</Label>
                <Select value={maintenanceSchedule} onValueChange={setMaintenanceSchedule}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0 2 * * 0">Weekly - Sunday 02:00</SelectItem>
                    <SelectItem value="0 2 * * 6">Weekly - Saturday 02:00</SelectItem>
                    <SelectItem value="0 3 * * 0">Weekly - Sunday 03:00</SelectItem>
                    <SelectItem value="0 2 1 * *">Monthly - 1st day 02:00</SelectItem>
                    <SelectItem value="0 2 15 * *">Monthly - 15th day 02:00</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Jobs will be staggered across a 6-hour window
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setQuickJobModal(null)}>
                Cancel
              </Button>
              <Button onClick={handleCreateMaintenanceJobs} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Create {selectedIds.size} Jobs
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
