"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import {
  Calendar,
  Clock,
  Server,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  RefreshCw,
  Wrench,
  HardDrive,
  Timer,
  Activity,
  ChevronRight,
  ChevronDown,
  Search,
  Database,
  ChevronLeft
} from "lucide-react"

interface HistoryItem {
  startedAt: string
  completedAt: string | null
  duration: number | null
  status: string
  sizeMb?: number | null
  errorMsg?: string | null
}

interface Job {
  id: string
  type: 'backup' | 'maintenance'
  name: string
  database: string
  server: string
  backupType?: string
  maintenanceType?: string
  scheduleCron: string
  scheduleDescription: string
  nextRun: string | null
  isEnabled: boolean
  isScheduled: boolean
  storageTarget?: string
  compression?: boolean
  checksum?: boolean
  retentionDays?: number
  lastRun: string | null
  lastCompleted: string | null
  lastDuration: number | null
  lastStatus: string | null
  lastError: string | null
  lastSizeMb?: number | null
  history: HistoryItem[]
  createdAt: string
}

interface JobsData {
  jobs: Job[]
  summary: {
    totalJobs: number
    activeJobs: number
    scheduledJobs: number
    backupJobs: number
    maintenanceJobs: number
  }
}

interface DatabaseGroup {
  key: string
  database: string
  server: string
  jobs: Job[]
  totalJobs: number
  activeJobs: number
  nextRun: string | null
  lastStatus: string | null
  hasBackup: boolean
  hasMaintenance: boolean
}

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatTimeUntil(date: string | null): string {
  if (!date) return '-'
  const now = new Date()
  const target = new Date(date)
  const diffMs = target.getTime() - now.getTime()

  if (diffMs < 0) return 'Now'

  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`
  return `${diffDays}d ${diffHours % 24}h`
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '-'
  if (seconds === 0) return '<1s'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return `${hours}h ${remainingMins}m`
}

export default function JobsPage() {
  const [data, setData] = useState<JobsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [filterType, setFilterType] = useState<'all' | 'backup' | 'maintenance'>('all')

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchJobs() {
    try {
      const res = await fetch('/api/jobs')
      const json = await res.json()
      setData(json)
    } catch {
      toast.error('Failed to fetch jobs')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function handleRunJob(e: React.MouseEvent, job: Job) {
    e.stopPropagation()
    toast.info(`Running ${job.type} job: ${job.name}`)
    try {
      const endpoint = job.type === 'backup'
        ? `/api/backups/${job.id}/run`
        : `/api/maintenance/${job.id}/run`

      const res = await fetch(endpoint, { method: 'POST' })
      if (res.ok) {
        toast.success('Job started successfully')
        setTimeout(fetchJobs, 2000)
      } else {
        toast.error('Failed to start job')
      }
    } catch {
      toast.error('Failed to start job')
    }
  }

  function handleRefresh() {
    setRefreshing(true)
    fetchJobs()
  }

  function toggleExpand(key: string) {
    setExpandedDbs(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function expandAll() {
    if (expandedDbs.size === filteredGroups.length) {
      setExpandedDbs(new Set())
    } else {
      setExpandedDbs(new Set(filteredGroups.map(g => g.key)))
    }
  }

  // Group jobs by database
  const databaseGroups = useMemo(() => {
    if (!data?.jobs) return []

    const groups = new Map<string, DatabaseGroup>()

    data.jobs.forEach(job => {
      const key = `${job.server}|${job.database}`

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          database: job.database,
          server: job.server,
          jobs: [],
          totalJobs: 0,
          activeJobs: 0,
          nextRun: null,
          lastStatus: null,
          hasBackup: false,
          hasMaintenance: false
        })
      }

      const group = groups.get(key)!
      group.jobs.push(job)
      group.totalJobs++
      if (job.isEnabled) group.activeJobs++
      if (job.type === 'backup') group.hasBackup = true
      if (job.type === 'maintenance') group.hasMaintenance = true

      // Track earliest next run
      if (job.nextRun && job.isEnabled) {
        if (!group.nextRun || new Date(job.nextRun) < new Date(group.nextRun)) {
          group.nextRun = job.nextRun
        }
      }

      // Track last status (prefer failed)
      if (job.lastStatus === 'failed') {
        group.lastStatus = 'failed'
      } else if (job.lastStatus === 'success' && group.lastStatus !== 'failed') {
        group.lastStatus = 'success'
      }
    })

    return Array.from(groups.values()).sort((a, b) => {
      // Sort by server, then database
      if (a.server !== b.server) return a.server.localeCompare(b.server, 'tr')
      return a.database.localeCompare(b.database, 'tr')
    })
  }, [data?.jobs])

  // Filter groups
  const filteredGroups = useMemo(() => {
    let filtered = databaseGroups

    // Filter by type
    if (filterType === 'backup') {
      filtered = filtered.filter(g => g.hasBackup)
    } else if (filterType === 'maintenance') {
      filtered = filtered.filter(g => g.hasMaintenance)
    }

    // Filter by search
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(g =>
        g.database.toLowerCase().includes(searchLower) ||
        g.server.toLowerCase().includes(searchLower)
      )
    }

    return filtered
  }, [databaseGroups, search, filterType])

  // Paginate
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredGroups.slice(start, start + pageSize)
  }, [filteredGroups, currentPage, pageSize])

  const totalPages = Math.ceil(filteredGroups.length / pageSize)

  // Get upcoming jobs sorted by next run
  const upcomingJobs = useMemo(() => {
    if (!data?.jobs) return []
    return data.jobs
      .filter(j => j.isEnabled && j.nextRun)
      .sort((a, b) => new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime())
      .slice(0, 10)
  }, [data?.jobs])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Scheduled Jobs</h1>
          <p className="text-muted-foreground">Monitor and manage all scheduled tasks</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Database className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{databaseGroups.length}</p>
                <p className="text-xs text-muted-foreground">Databases</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.summary.totalJobs || 0}</p>
                <p className="text-xs text-muted-foreground">Total Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Activity className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.summary.activeJobs || 0}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <HardDrive className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.summary.backupJobs || 0}</p>
                <p className="text-xs text-muted-foreground">Backup Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <Wrench className="h-5 w-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.summary.maintenanceJobs || 0}</p>
                <p className="text-xs text-muted-foreground">Maintenance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Database Jobs Table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Jobs by Database</CardTitle>
              <CardDescription>
                {filteredGroups.length} database{filteredGroups.length !== 1 ? 's' : ''} with jobs
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={expandAll}>
                {expandedDbs.size === filteredGroups.length ? 'Collapse All' : 'Expand All'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search databases..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Tabs value={filterType} onValueChange={(v) => { setFilterType(v as typeof filterType); setCurrentPage(1) }}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="backup">Backup</TabsTrigger>
                <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1) }}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map(size => (
                  <SelectItem key={size} value={size.toString()}>{size} rows</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Database List */}
          <div className="border rounded-lg divide-y">
            {paginatedGroups.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No databases found
              </div>
            ) : (
              paginatedGroups.map(group => {
                const isExpanded = expandedDbs.has(group.key)
                const filteredJobs = filterType === 'all'
                  ? group.jobs
                  : group.jobs.filter(j => j.type === filterType)

                return (
                  <div key={group.key}>
                    {/* Database Row */}
                    <div
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => toggleExpand(group.key)}
                    >
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>

                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Database className="h-4 w-4 text-blue-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{group.database}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Server className="h-3 w-3" />
                            {group.server}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {group.hasBackup && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <HardDrive className="h-3 w-3 text-orange-500" />
                            {group.jobs.filter(j => j.type === 'backup').length}
                          </Badge>
                        )}
                        {group.hasMaintenance && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Wrench className="h-3 w-3 text-cyan-500" />
                            {group.jobs.filter(j => j.type === 'maintenance').length}
                          </Badge>
                        )}
                      </div>

                      <div className="w-24 text-right">
                        {group.nextRun ? (
                          <p className="text-sm font-medium text-primary">{formatTimeUntil(group.nextRun)}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">-</p>
                        )}
                      </div>

                      <div className="w-20">
                        {group.lastStatus && (
                          <Badge
                            variant={group.lastStatus === 'success' ? 'default' : 'destructive'}
                            className="text-xs"
                          >
                            {group.lastStatus === 'success' ? (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <XCircle className="h-3 w-3 mr-1" />
                            )}
                            {group.lastStatus}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Expanded Jobs */}
                    {isExpanded && (
                      <div className="bg-muted/30 border-t">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-2 pl-12 font-medium">Type</th>
                              <th className="text-left p-2 font-medium">Schedule</th>
                              <th className="text-left p-2 font-medium">Next Run</th>
                              <th className="text-left p-2 font-medium">Last Run</th>
                              <th className="text-left p-2 font-medium">Duration</th>
                              <th className="text-left p-2 font-medium">Status</th>
                              <th className="text-right p-2 pr-4 font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredJobs.map(job => (
                              <tr key={job.id} className="border-b last:border-b-0 hover:bg-muted/50">
                                <td className="p-2 pl-12">
                                  <div className="flex items-center gap-2">
                                    {job.type === 'backup' ? (
                                      <HardDrive className="h-4 w-4 text-orange-500" />
                                    ) : (
                                      <Wrench className="h-4 w-4 text-cyan-500" />
                                    )}
                                    <Badge variant="outline" className="text-xs">
                                      {job.backupType || job.maintenanceType}
                                    </Badge>
                                  </div>
                                </td>
                                <td className="p-2">
                                  <div>
                                    <p>{job.scheduleDescription}</p>
                                    <code className="text-xs text-muted-foreground">{job.scheduleCron}</code>
                                  </div>
                                </td>
                                <td className="p-2">
                                  {job.nextRun && job.isEnabled ? (
                                    <div>
                                      <p className="font-medium text-primary">{formatTimeUntil(job.nextRun)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(job.nextRun)}</p>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="p-2">
                                  {job.lastRun ? (
                                    <div>
                                      <p>{formatDate(job.lastRun)}</p>
                                      {job.lastSizeMb && (
                                        <p className="text-xs text-muted-foreground">{job.lastSizeMb.toFixed(1)} MB</p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">Never</span>
                                  )}
                                </td>
                                <td className="p-2">
                                  {formatDuration(job.lastDuration)}
                                </td>
                                <td className="p-2">
                                  <div className="flex flex-col gap-1">
                                    {job.isEnabled ? (
                                      <Badge variant="default" className="text-xs w-fit">
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        Enabled
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-xs w-fit">
                                        <Pause className="h-3 w-3 mr-1" />
                                        Disabled
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 pr-4 text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => handleRunJob(e, job)}
                                    disabled={!job.isEnabled}
                                  >
                                    <Play className="h-4 w-4 mr-1" />
                                    Run
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredGroups.length)} of {filteredGroups.length} databases
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Jobs Summary */}
      {upcomingJobs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Upcoming Scheduled Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {upcomingJobs.map(job => (
                <div
                  key={job.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-card text-sm"
                >
                  {job.type === 'backup' ? (
                    <HardDrive className="h-3 w-3 text-orange-500" />
                  ) : (
                    <Wrench className="h-3 w-3 text-cyan-500" />
                  )}
                  <span className="font-medium">{job.database}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{job.backupType || job.maintenanceType}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-primary font-medium">{formatTimeUntil(job.nextRun)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
