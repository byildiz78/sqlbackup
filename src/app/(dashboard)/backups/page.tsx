"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { MoreHorizontal, Play, Trash2, Calendar, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { BulkBackupModal } from "@/components/bulk-backup-modal"
import { CreateBackupModal } from "@/components/create-backup-modal"
import { DataTable, Column } from "@/components/data-table"

interface DatabaseItem {
  id: string
  name: string
  serverId: string
  server: { name: string }
}

interface BackupJob {
  id: string
  backupType: string
  scheduleCron: string
  storageTarget: string
  isEnabled: boolean
  compression: boolean
  checksum: boolean
  retentionDays: number
  database: {
    name: string
    server: { name: string }
  }
  history: Array<{
    status: string
    startedAt: string
  }>
}

interface BackupHistory {
  id: string
  backupType: string
  status: string
  startedAt: string
  completedAt: string | null
  filePath: string | null
  sizeMb: number | null
  errorMsg: string | null
  duration: number | null
  database: {
    name: string
    server: { name: string }
  }
}

export default function BackupsPage() {
  const [jobs, setJobs] = useState<BackupJob[]>([])
  const [history, setHistory] = useState<BackupHistory[]>([])
  const [databases, setDatabases] = useState<DatabaseItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [jobsRes, historyRes, dbRes] = await Promise.all([
        fetch("/api/backups"),
        fetch("/api/backups/history?limit=100"),
        fetch("/api/databases")
      ])

      setJobs(await jobsRes.json())
      setHistory(await historyRes.json())
      setDatabases(await dbRes.json())
    } catch {
      toast.error("Failed to fetch data")
    } finally {
      setLoading(false)
    }
  }

  async function handleRunNow(jobId: string) {
    toast.info("Starting backup...")
    try {
      await fetch(`/api/backups/${jobId}/run`, { method: "POST" })
      toast.success("Backup job started")
      setTimeout(fetchData, 2000)
    } catch {
      toast.error("Failed to start backup")
    }
  }

  async function handleToggle(jobId: string, isEnabled: boolean) {
    try {
      await fetch(`/api/backups/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !isEnabled })
      })
      toast.success(isEnabled ? "Job disabled" : "Job enabled")
      fetchData()
    } catch {
      toast.error("Failed to update job")
    }
  }

  async function handleDelete(jobId: string) {
    if (!confirm("Are you sure you want to delete this backup job?")) return

    try {
      await fetch(`/api/backups/${jobId}`, { method: "DELETE" })
      toast.success("Job deleted")
      fetchData()
    } catch {
      toast.error("Failed to delete job")
    }
  }

  function formatDuration(seconds: number | null) {
    if (seconds === null || seconds === undefined) return "-"
    if (seconds === 0) return "<1s"
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
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
        return null
    }
  }

  const jobColumns: Column<BackupJob>[] = useMemo(() => [
    {
      key: "database.name",
      header: "Database",
      cell: (job) => (
        <div>
          <p className="font-medium">{job.database.name}</p>
          <p className="text-sm text-muted-foreground">{job.database.server.name}</p>
        </div>
      )
    },
    {
      key: "backupType",
      header: "Type",
      cell: (job) => <Badge variant="outline">{job.backupType}</Badge>
    },
    {
      key: "scheduleCron",
      header: "Schedule",
      cell: (job) => <code className="text-sm">{job.scheduleCron}</code>
    },
    {
      key: "lastRun",
      header: "Last Run",
      sortable: false,
      cell: (job) => job.history[0]
        ? new Date(job.history[0].startedAt).toLocaleString('tr-TR')
        : "Never"
    },
    {
      key: "isEnabled",
      header: "Status",
      cell: (job) => (
        <Badge variant={job.isEnabled ? "default" : "secondary"}>
          {job.isEnabled ? "Active" : "Disabled"}
        </Badge>
      )
    },
    {
      key: "actions",
      header: "Actions",
      sortable: false,
      searchable: false,
      className: "w-[100px]",
      cell: (job) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleRunNow(job.id)}>
              <Play className="h-4 w-4 mr-2" />
              Run Now
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleToggle(job.id, job.isEnabled)}>
              {job.isEnabled ? "Disable" : "Enable"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => handleDelete(job.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ], [])

  const historyColumns: Column<BackupHistory>[] = useMemo(() => [
    {
      key: "database.name",
      header: "Database",
      cell: (item) => (
        <div>
          <p className="font-medium">{item.database.name}</p>
          <p className="text-sm text-muted-foreground">{item.database.server.name}</p>
        </div>
      )
    },
    {
      key: "backupType",
      header: "Type",
      cell: (item) => <Badge variant="outline">{item.backupType}</Badge>
    },
    {
      key: "startedAt",
      header: "Started",
      sortValue: (item) => new Date(item.startedAt).getTime(),
      cell: (item) => new Date(item.startedAt).toLocaleString('tr-TR')
    },
    {
      key: "duration",
      header: "Duration",
      sortValue: (item) => item.duration || 0,
      cell: (item) => formatDuration(item.duration)
    },
    {
      key: "sizeMb",
      header: "Size",
      sortValue: (item) => item.sizeMb || 0,
      cell: (item) => item.sizeMb ? `${item.sizeMb.toFixed(2)} MB` : "-"
    },
    {
      key: "status",
      header: "Status",
      cell: (item) => (
        <div className="flex items-center gap-2">
          {getStatusIcon(item.status)}
          <span className="capitalize">{item.status}</span>
        </div>
      )
    }
  ], [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Backup Jobs</h1>
          <p className="text-muted-foreground">Schedule and manage database backups</p>
        </div>
        <div className="flex gap-2">
          <BulkBackupModal databases={databases} onSuccess={fetchData} />
          <CreateBackupModal databases={databases} onSuccess={fetchData} />
        </div>
      </div>

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">
            <Calendar className="h-4 w-4 mr-2" />
            Scheduled Jobs ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="h-4 w-4 mr-2" />
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle>Backup Jobs</CardTitle>
              <CardDescription>{jobs.length} job{jobs.length !== 1 ? "s" : ""} configured</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={jobs}
                columns={jobColumns}
                loading={loading}
                searchPlaceholder="Search backup jobs..."
                emptyMessage="No backup jobs configured. Create your first job to get started."
                pageSize={25}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Backup History</CardTitle>
              <CardDescription>Recent backup operations</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={history}
                columns={historyColumns}
                searchPlaceholder="Search backup history..."
                emptyMessage="No backup history yet"
                pageSize={25}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
