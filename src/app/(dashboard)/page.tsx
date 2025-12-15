import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getDiskStats } from "@/lib/disk-stats"
import { getStorageQuota, getStatus, formatBytes as borgFormatBytes } from "@/lib/borg-backup"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Server,
  Database,
  Calendar,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  HardDrive,
  Activity,
  TrendingUp,
  TrendingDown,
  Wrench,
  AlertCircle,
  Timer,
  FolderArchive,
  Cloud,
  RefreshCw,
  Archive
} from "lucide-react"

async function getStats() {
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    servers,
    databaseCount,
    backupJobCount,
    maintenanceJobCount,
    recentBackups,
    successCount24h,
    failedCount24h,
    successCount7d,
    failedCount7d,
    totalBackupSize,
    databasesWithoutBackup,
    runningJobs,
    upcomingJobs
  ] = await Promise.all([
    prisma.sqlServer.findMany({
      where: { isActive: true },
      include: { _count: { select: { databases: true } } }
    }),
    prisma.database.count(),
    prisma.backupJob.count({ where: { isEnabled: true } }),
    prisma.maintenanceJob.count({ where: { isEnabled: true } }),
    prisma.backupHistory.findMany({
      take: 15,
      orderBy: { startedAt: "desc" },
      include: { database: { include: { server: true } } }
    }),
    prisma.backupHistory.count({
      where: { status: "success", startedAt: { gte: last24h } }
    }),
    prisma.backupHistory.count({
      where: { status: "failed", startedAt: { gte: last24h } }
    }),
    prisma.backupHistory.count({
      where: { status: "success", startedAt: { gte: last7d } }
    }),
    prisma.backupHistory.count({
      where: { status: "failed", startedAt: { gte: last7d } }
    }),
    prisma.backupHistory.aggregate({
      _sum: { sizeMb: true },
      where: { status: "success" }
    }),
    prisma.database.findMany({
      where: {
        OR: [
          { lastBackupFull: null },
          { lastBackupFull: { lt: last7d } }
        ]
      },
      include: { server: true }
    }),
    prisma.backupHistory.count({
      where: { status: "running" }
    }),
    prisma.backupJob.findMany({
      where: { isEnabled: true },
      include: { database: { include: { server: true } } },
      take: 5
    })
  ])

  // Calculate success rate
  const total24h = successCount24h + failedCount24h
  const successRate24h = total24h > 0 ? Math.round((successCount24h / total24h) * 100) : 100

  const total7d = successCount7d + failedCount7d
  const successRate7d = total7d > 0 ? Math.round((successCount7d / total7d) * 100) : 100

  // Get maintenance history
  const maintenanceHistory = await prisma.maintenanceHistory.findMany({
    take: 5,
    orderBy: { startedAt: "desc" },
    include: { database: { include: { server: true } } }
  })

  // Get disk stats
  const diskStats = await getDiskStats()

  // Get Hetzner StorageBox info
  let storageBoxInfo = null
  try {
    const borgStatus = await getStatus()
    if (borgStatus.connected) {
      const quota = await getStorageQuota()
      storageBoxInfo = {
        connected: true,
        quota,
        lastSync: borgStatus.lastSync,
        archiveCount: borgStatus.archiveCount,
        repoInfo: borgStatus.repoInfo
      }
    } else {
      storageBoxInfo = { connected: false }
    }
  } catch {
    storageBoxInfo = { connected: false }
  }

  return {
    servers,
    serverCount: servers.length,
    databaseCount,
    backupJobCount,
    maintenanceJobCount,
    recentBackups,
    successCount24h,
    failedCount24h,
    successRate24h,
    successRate7d,
    total7d,
    totalBackupSize: totalBackupSize._sum.sizeMb || 0,
    databasesWithoutBackup,
    runningJobs,
    upcomingJobs,
    maintenanceHistory,
    diskStats,
    storageBoxInfo
  }
}

function formatBytes(mb: number): string {
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getTimeAgo(date: Date | string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export default async function DashboardPage() {
  const session = await auth()
  const stats = await getStats()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {session?.user?.name}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          {new Date().toLocaleString('tr-TR')}
        </div>
      </div>

      {/* Alert Banner - if there are issues */}
      {(stats.failedCount24h > 0 || stats.databasesWithoutBackup.length > 0) && (
        <Card className="border-orange-500 bg-orange-500/10">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <div className="flex-1">
                <p className="font-medium text-orange-700 dark:text-orange-400">Attention Required</p>
                <p className="text-sm text-muted-foreground">
                  {stats.failedCount24h > 0 && `${stats.failedCount24h} failed backup(s) in the last 24 hours. `}
                  {stats.databasesWithoutBackup.length > 0 && `${stats.databasesWithoutBackup.length} database(s) without recent backup.`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Servers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SQL Servers</CardTitle>
            <Server className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.serverCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active instances
            </p>
            <div className="mt-3 space-y-1">
              {stats.servers.slice(0, 3).map(server => (
                <div key={server.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{server.name}</span>
                  <Badge variant="outline" className="text-xs">{server._count.databases} DBs</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Databases */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Databases</CardTitle>
            <Database className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.databaseCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total managed
            </p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span>Protected</span>
                <span className="font-medium">{stats.databaseCount - stats.databasesWithoutBackup.length}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${stats.databaseCount > 0
                      ? ((stats.databaseCount - stats.databasesWithoutBackup.length) / stats.databaseCount) * 100
                      : 0}%`
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Backup Jobs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Backup Jobs</CardTitle>
            <Calendar className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.backupJobCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Scheduled jobs
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <Wrench className="h-3 w-3 text-muted-foreground" />
                <span>{stats.maintenanceJobCount} maintenance</span>
              </div>
              {stats.runningJobs > 0 && (
                <div className="flex items-center gap-1 text-blue-500">
                  <Activity className="h-3 w-3 animate-pulse" />
                  <span>{stats.runningJobs} running</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            {stats.successRate24h >= 90 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.successRate24h}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Last 24 hours
            </p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  <span>{stats.successCount24h}</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-3 w-3 text-red-500" />
                  <span>{stats.failedCount24h}</span>
                </div>
              </div>
              <div className="w-full bg-red-200 dark:bg-red-900 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${stats.successRate24h}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* 7-Day Overview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4" />
              7-Day Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-green-500/10 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.successRate7d}%</div>
                <div className="text-xs text-muted-foreground">Success Rate</div>
              </div>
              <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.total7d}</div>
                <div className="text-xs text-muted-foreground">Total Backups</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Disk Usage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Disk Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Used</span>
                <span className="font-medium">{stats.diskStats.usedGb} GB / {stats.diskStats.totalGb} GB</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    stats.diskStats.usedPercent > 90 ? 'bg-red-500' :
                    stats.diskStats.usedPercent > 75 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${stats.diskStats.usedPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{stats.diskStats.usedPercent}% used</span>
                <span>{stats.diskStats.freeGb} GB free</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Backup Folder Size */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FolderArchive className="h-4 w-4" />
              Backup Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-center p-3 bg-purple-500/10 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {stats.diskStats.backupFolderGb > 0 ? `${stats.diskStats.backupFolderGb} GB` : formatBytes(stats.totalBackupSize)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {stats.diskStats.backupFolderGb > 0 ? 'Backup folder size' : 'Total backup records'}
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate" title={stats.diskStats.backupFolderPath}>
                {stats.diskStats.backupFolderPath}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Hetzner StorageBox */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              Hetzner StorageBox
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.storageBoxInfo?.connected ? (
              <div className="space-y-3">
                {stats.storageBoxInfo.quota ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Used</span>
                      <span className="font-medium">
                        {borgFormatBytes(stats.storageBoxInfo.quota.usedBytes)} / {borgFormatBytes(stats.storageBoxInfo.quota.totalBytes)}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          stats.storageBoxInfo.quota.usedPercent > 90 ? 'bg-red-500' :
                          stats.storageBoxInfo.quota.usedPercent > 75 ? 'bg-yellow-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${stats.storageBoxInfo.quota.usedPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{stats.storageBoxInfo.quota.usedPercent}% used</span>
                      <span>{borgFormatBytes(stats.storageBoxInfo.quota.freeBytes)} free</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-2">
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Connected
                    </Badge>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <Cloud className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-xs text-muted-foreground">Not connected</p>
                <a href="/storage" className="text-xs text-primary hover:underline">Configure</a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* StorageBox Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Remote Storage Details
            </CardTitle>
            <CardDescription>Hetzner StorageBox sync status</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.storageBoxInfo?.connected ? (
              <div className="space-y-4">
                {/* Storage Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-blue-500/10 rounded-lg text-center">
                    <HardDrive className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                    <div className="text-lg font-bold text-blue-600">
                      {stats.storageBoxInfo.quota ? borgFormatBytes(stats.storageBoxInfo.quota.usedBytes) : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground">Used Space</div>
                  </div>
                  <div className="p-3 bg-green-500/10 rounded-lg text-center">
                    <HardDrive className="h-5 w-5 mx-auto mb-1 text-green-500" />
                    <div className="text-lg font-bold text-green-600">
                      {stats.storageBoxInfo.quota ? borgFormatBytes(stats.storageBoxInfo.quota.freeBytes) : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground">Free Space</div>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-lg text-center">
                    <Archive className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                    <div className="text-lg font-bold text-purple-600">
                      {stats.storageBoxInfo.archiveCount || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Archives</div>
                  </div>
                  <div className="p-3 bg-orange-500/10 rounded-lg text-center">
                    <FolderArchive className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                    <div className="text-lg font-bold text-orange-600">
                      {stats.storageBoxInfo.repoInfo ? borgFormatBytes(stats.storageBoxInfo.repoInfo.uniqueSize) : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground">Deduplicated</div>
                  </div>
                </div>

                {/* Last Sync Info */}
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Last Sync</span>
                    </div>
                    <div className="text-right">
                      {stats.storageBoxInfo.lastSync ? (
                        <>
                          <p className="text-sm font-medium">{getTimeAgo(stats.storageBoxInfo.lastSync)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(stats.storageBoxInfo.lastSync)}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Never</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Total Capacity Bar */}
                {stats.storageBoxInfo.quota && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Total Capacity</span>
                      <span className="font-medium">{borgFormatBytes(stats.storageBoxInfo.quota.totalBytes)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          stats.storageBoxInfo.quota.usedPercent > 90 ? 'bg-red-500' :
                          stats.storageBoxInfo.quota.usedPercent > 75 ? 'bg-yellow-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${stats.storageBoxInfo.quota.usedPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                <a href="/storage" className="block text-center text-sm text-primary hover:underline">
                  Go to Storage Management →
                </a>
              </div>
            ) : (
              <div className="text-center py-8">
                <Cloud className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="font-medium text-muted-foreground">StorageBox Not Connected</p>
                <p className="text-sm text-muted-foreground mb-4">Configure remote backup storage</p>
                <a href="/storage" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                  <Cloud className="h-4 w-4" />
                  Setup StorageBox
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Warnings & Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Warnings & Alerts
            </CardTitle>
            <CardDescription>Issues requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.databasesWithoutBackup.length === 0 && stats.failedCount24h === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="font-medium text-green-600">All Systems Healthy</p>
                <p className="text-sm">No issues detected</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Failed Backups */}
                {stats.failedCount24h > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-700 dark:text-red-400">
                        {stats.failedCount24h} Failed Backup{stats.failedCount24h > 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">In the last 24 hours</p>
                    </div>
                  </div>
                )}

                {/* Databases without backup */}
                {stats.databasesWithoutBackup.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-orange-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm font-medium">Databases Without Recent Backup</span>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {stats.databasesWithoutBackup.map((db) => (
                        <div key={db.id} className="flex items-center justify-between p-2 rounded bg-orange-500/10 text-sm">
                          <div>
                            <span className="font-medium">{db.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">({db.server.name})</span>
                          </div>
                          <span className="text-xs text-orange-600">
                            {db.lastBackupFull
                              ? `Last: ${formatDate(db.lastBackupFull)}`
                              : 'Never backed up'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Maintenance Activity */}
      {stats.maintenanceHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Recent Maintenance Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {stats.maintenanceHistory.map((maint) => (
                <div key={maint.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className={`p-2 rounded-full ${
                    maint.status === "success" ? "bg-green-500/10" :
                    maint.status === "failed" ? "bg-red-500/10" : "bg-blue-500/10"
                  }`}>
                    <Wrench className={`h-4 w-4 ${
                      maint.status === "success" ? "text-green-500" :
                      maint.status === "failed" ? "text-red-500" : "text-blue-500"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{maint.database.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {maint.maintenanceType} • {getTimeAgo(maint.startedAt)}
                    </p>
                  </div>
                  <Badge variant={maint.status === "success" ? "default" : "destructive"} className="text-xs">
                    {maint.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
