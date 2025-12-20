"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Plus, HardDrive, Cloud, Server, Trash2, RefreshCw, CheckCircle, XCircle, Upload, Archive, Clock, Download, FolderOpen, File, Folder, Search, Database, Calendar, FileArchive, Activity, Gauge, Timer, FileText, Save, PieChart, Terminal, AlertTriangle } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface StorageTarget {
  id: string
  name: string
  storageType: string
  config: {
    localPath?: string
    s3Bucket?: string
    s3Region?: string
    s3Endpoint?: string
    s3AccessKey?: string
  }
  isDefault: boolean
}

interface StorageQuota {
  totalBytes: number
  usedBytes: number
  freeBytes: number
  usedPercent: number
  totalFormatted: string
  usedFormatted: string
  freeFormatted: string
}

interface BorgStatus {
  ready: boolean
  borgInstalled: boolean
  sshpassInstalled: boolean
  message?: string
  storageQuota?: StorageQuota | null
  status: {
    initialized: boolean
    connected: boolean
    lastSync: string | null
    lastError: string | null
    repoInfo: {
      totalSize: number
      uniqueSize: number
      totalSizeFormatted: string
      uniqueSizeFormatted: string
    } | null
    archives: { name: string; start: string }[]
    archiveCount: number
  } | null
}

interface SyncLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

interface SyncStatus {
  status: 'idle' | 'initializing' | 'syncing' | 'pruning' | 'compacting' | 'completed' | 'failed'
  startedAt: string | null
  completedAt: string | null
  currentFile: string | null
  filesProcessed: number
  totalFiles: number
  bytesTransferred: number
  totalBytes: number
  transferSpeed: number
  estimatedTimeRemaining: number | null
  archiveName: string | null
  errorMessage: string | null
  bandwidthLimit: number | null
  logs?: SyncLogEntry[]
}

export default function StoragePage() {
  const [targets, setTargets] = useState<StorageTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [storageType, setStorageType] = useState("LOCAL")

  // Borg state
  const [borgStatus, setBorgStatus] = useState<BorgStatus | null>(null)
  const [borgLoading, setBorgLoading] = useState(true)
  const [borgSyncing, setBorgSyncing] = useState(false)
  const [borgInitializing, setBorgInitializing] = useState(false)
  const [borgBackupPath, setBorgBackupPath] = useState("")
  const [originalBackupPath, setOriginalBackupPath] = useState("")
  const [savingBackupPath, setSavingBackupPath] = useState(false)

  // Sync status state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)

  // Restore dialog state
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [restoreArchives, setRestoreArchives] = useState<{ name: string; start: string }[]>([])
  const [selectedArchive, setSelectedArchive] = useState<string | null>(null)
  const [archiveContents, setArchiveContents] = useState<{ path: string; type: string; size: number }[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [restoreDestination, setRestoreDestination] = useState("/tmp/restore")
  const [loadingArchives, setLoadingArchives] = useState(false)
  const [loadingContents, setLoadingContents] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [fileSearchQuery, setFileSearchQuery] = useState("")

  const [formData, setFormData] = useState({
    name: "",
    localPath: "/backup",
    s3Bucket: "",
    s3Region: "us-east-1",
    s3AccessKey: "",
    s3SecretKey: "",
    s3Endpoint: "",
    isDefault: false
  })

  useEffect(() => {
    fetchTargets()
    fetchBorgStatus()
    fetchBackupPath()
    fetchSyncStatus()
  }, [])

  // Poll sync status when syncing
  useEffect(() => {
    if (!syncStatus) return

    const isActive = ['initializing', 'syncing', 'pruning', 'compacting'].includes(syncStatus.status)

    if (isActive || borgSyncing) {
      const interval = setInterval(fetchSyncStatus, 1000) // Poll every second
      return () => clearInterval(interval)
    }
  }, [syncStatus?.status, borgSyncing])

  async function fetchBackupPath() {
    try {
      const res = await fetch("/api/settings/backup")
      const data = await res.json()
      if (data.backupPath) {
        setBorgBackupPath(data.backupPath)
        setOriginalBackupPath(data.backupPath)
      }
    } catch {
      console.error("Failed to fetch backup path")
    }
  }

  async function saveBackupPath() {
    if (!borgBackupPath || borgBackupPath === originalBackupPath) return

    setSavingBackupPath(true)
    try {
      const res = await fetch("/api/settings/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupPath: borgBackupPath })
      })
      const data = await res.json()

      if (data.success) {
        setOriginalBackupPath(borgBackupPath)
        toast.success("Backup path saved")
      } else {
        toast.error(data.error || "Failed to save backup path")
      }
    } catch {
      toast.error("Failed to save backup path")
    } finally {
      setSavingBackupPath(false)
    }
  }

  const backupPathChanged = borgBackupPath !== originalBackupPath

  async function fetchSyncStatus() {
    try {
      const res = await fetch("/api/borg/status")
      const data = await res.json()
      if (data.success !== false) {
        setSyncStatus(data)

        // Update borgSyncing based on status
        const isActive = ['initializing', 'syncing', 'pruning', 'compacting'].includes(data.status)
        if (!isActive && borgSyncing) {
          setBorgSyncing(false)
          if (data.status === 'completed') {
            toast.success("Sync completed successfully!")
            fetchBorgStatus() // Refresh borg status
          } else if (data.status === 'failed') {
            toast.error(data.errorMessage || "Sync failed")
          }
        }
      }
    } catch {
      console.error("Failed to fetch sync status")
    }
  }

  async function fetchBorgStatus() {
    try {
      const res = await fetch("/api/borg")
      const data = await res.json()
      setBorgStatus(data)
    } catch {
      console.error("Failed to fetch borg status")
    } finally {
      setBorgLoading(false)
    }
  }

  async function handleBorgInit() {
    setBorgInitializing(true)
    try {
      const res = await fetch("/api/borg/init", { method: "POST" })
      const data = await res.json()

      if (data.success) {
        toast.success("Borg repository initialized successfully")
        fetchBorgStatus()
      } else {
        toast.error(data.error || "Failed to initialize repository")
      }
    } catch {
      toast.error("Failed to initialize repository")
    } finally {
      setBorgInitializing(false)
    }
  }

  async function handleBorgSync() {
    setBorgSyncing(true)
    toast.info(`Starting backup sync for ${borgBackupPath}...`)
    try {
      const res = await fetch("/api/borg/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupPath: borgBackupPath })
      })
      const data = await res.json()

      if (data.success) {
        toast.success("Backup synced to Hetzner successfully!")
        fetchBorgStatus()
      } else {
        toast.error(data.error || "Sync failed")
      }
    } catch {
      toast.error("Sync failed")
    } finally {
      setBorgSyncing(false)
    }
  }

  async function openRestoreDialog() {
    setRestoreDialogOpen(true)
    setLoadingArchives(true)
    setSelectedArchive(null)
    setArchiveContents([])

    try {
      const res = await fetch("/api/borg/restore")
      const data = await res.json()
      if (data.success) {
        setRestoreArchives(data.archives || [])
      } else {
        toast.error("Failed to load archives")
      }
    } catch {
      toast.error("Failed to load archives")
    } finally {
      setLoadingArchives(false)
    }
  }

  async function selectArchive(archiveName: string) {
    setSelectedArchive(archiveName)
    setLoadingContents(true)
    setArchiveContents([])
    setSelectedFiles(new Set())
    setFileSearchQuery("")

    try {
      const res = await fetch(`/api/borg/restore?archive=${encodeURIComponent(archiveName)}&action=contents`)
      const data = await res.json()
      if (data.success) {
        setArchiveContents(data.files || [])
      } else {
        toast.error(data.error || "Failed to load archive contents")
      }
    } catch {
      toast.error("Failed to load archive contents")
    } finally {
      setLoadingContents(false)
    }
  }

  function toggleFileSelection(path: string) {
    setSelectedFiles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }

  function selectAllFiles() {
    const allFiles = archiveContents.filter(f => f.type !== 'd').map(f => f.path)
    setSelectedFiles(new Set(allFiles))
  }

  function clearFileSelection() {
    setSelectedFiles(new Set())
  }

  async function handleRestore() {
    if (!selectedArchive || !restoreDestination) {
      toast.error("Please select an archive and destination")
      return
    }

    setRestoring(true)
    const fileCount = selectedFiles.size
    const message = fileCount > 0
      ? `Restoring ${fileCount} selected file(s)...`
      : `Restoring entire archive...`
    toast.info(message)

    try {
      const res = await fetch("/api/borg/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archiveName: selectedArchive,
          destinationPath: restoreDestination,
          specificPaths: fileCount > 0 ? Array.from(selectedFiles) : undefined
        })
      })
      const data = await res.json()

      if (data.success) {
        toast.success(`Restored to ${data.extractedTo}`)
        setRestoreDialogOpen(false)
      } else {
        toast.error(data.error || "Restore failed")
      }
    } catch {
      toast.error("Restore failed")
    } finally {
      setRestoring(false)
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  }

  function formatDuration(seconds: number | null): string {
    if (seconds === null || seconds <= 0) return "--"
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${mins}m`
  }

  function formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond === 0) return "0 B/s"
    const k = 1024
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"]
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k))
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  }

  function getSyncStatusLabel(status: string): { label: string; color: string } {
    switch (status) {
      case 'idle': return { label: 'Idle', color: 'bg-gray-500' }
      case 'initializing': return { label: 'Initializing...', color: 'bg-yellow-500' }
      case 'syncing': return { label: 'Syncing...', color: 'bg-blue-500' }
      case 'pruning': return { label: 'Pruning old archives...', color: 'bg-purple-500' }
      case 'compacting': return { label: 'Compacting...', color: 'bg-indigo-500' }
      case 'completed': return { label: 'Completed', color: 'bg-green-500' }
      case 'failed': return { label: 'Failed', color: 'bg-red-500' }
      default: return { label: status, color: 'bg-gray-500' }
    }
  }

  // Get filtered files (only actual files, not directories)
  const filteredFiles = archiveContents
    .filter(f => f.type !== 'd')
    .filter(f => {
      if (!fileSearchQuery) return true
      const fileName = f.path.split('/').pop()?.toLowerCase() || ''
      return fileName.includes(fileSearchQuery.toLowerCase())
    })

  // Calculate total size of selected files
  const selectedFilesSize = Array.from(selectedFiles).reduce((total, path) => {
    const file = archiveContents.find(f => f.path === path)
    return total + (file?.size || 0)
  }, 0)

  // Get total archive size
  const totalArchiveSize = archiveContents
    .filter(f => f.type !== 'd')
    .reduce((total, f) => total + f.size, 0)

  async function fetchTargets() {
    try {
      const res = await fetch("/api/storage")
      const data = await res.json()
      setTargets(data)
    } catch {
      toast.error("Failed to fetch storage targets")
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const config: Record<string, string> = {}

      if (storageType === "LOCAL" || storageType === "NFS") {
        config.localPath = formData.localPath
      } else if (storageType === "S3") {
        config.s3Bucket = formData.s3Bucket
        config.s3Region = formData.s3Region
        config.s3AccessKey = formData.s3AccessKey
        config.s3SecretKey = formData.s3SecretKey
        if (formData.s3Endpoint) {
          config.s3Endpoint = formData.s3Endpoint
        }
      }

      const res = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          storageType,
          config,
          isDefault: formData.isDefault
        })
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to create storage target")
        return
      }

      toast.success("Storage target created")
      setDialogOpen(false)
      setFormData({
        name: "",
        localPath: "/backup",
        s3Bucket: "",
        s3Region: "us-east-1",
        s3AccessKey: "",
        s3SecretKey: "",
        s3Endpoint: "",
        isDefault: false
      })
      fetchTargets()
    } catch {
      toast.error("Failed to create storage target")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this storage target?")) return

    try {
      const res = await fetch(`/api/storage/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Storage target deleted")
        fetchTargets()
      } else {
        toast.error("Failed to delete storage target")
      }
    } catch {
      toast.error("Failed to delete storage target")
    }
  }

  function getStorageIcon(type: string) {
    switch (type) {
      case "S3":
        return <Cloud className="h-8 w-8 text-orange-500" />
      case "NFS":
        return <Server className="h-8 w-8 text-purple-500" />
      default:
        return <HardDrive className="h-8 w-8 text-blue-500" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Storage Targets</h1>
          <p className="text-muted-foreground">Configure where backups are stored</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Storage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Storage Target</DialogTitle>
              <DialogDescription>Configure a new backup storage location</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Primary Backup Storage"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Storage Type</Label>
                  <Select value={storageType} onValueChange={setStorageType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOCAL">Local Disk</SelectItem>
                      <SelectItem value="NFS">Network Share (NFS)</SelectItem>
                      <SelectItem value="S3">S3 / MinIO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(storageType === "LOCAL" || storageType === "NFS") && (
                  <div className="space-y-2">
                    <Label>Path</Label>
                    <Input
                      value={formData.localPath}
                      onChange={(e) => setFormData({ ...formData, localPath: e.target.value })}
                      placeholder="/backup/mssql"
                      required
                    />
                  </div>
                )}

                {storageType === "S3" && (
                  <>
                    <div className="space-y-2">
                      <Label>Bucket Name</Label>
                      <Input
                        value={formData.s3Bucket}
                        onChange={(e) => setFormData({ ...formData, s3Bucket: e.target.value })}
                        placeholder="my-backup-bucket"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Region</Label>
                        <Input
                          value={formData.s3Region}
                          onChange={(e) => setFormData({ ...formData, s3Region: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Endpoint (MinIO)</Label>
                        <Input
                          value={formData.s3Endpoint}
                          onChange={(e) => setFormData({ ...formData, s3Endpoint: e.target.value })}
                          placeholder="http://minio:9000"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Access Key</Label>
                      <Input
                        value={formData.s3AccessKey}
                        onChange={(e) => setFormData({ ...formData, s3AccessKey: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Secret Key</Label>
                      <Input
                        type="password"
                        value={formData.s3SecretKey}
                        onChange={(e) => setFormData({ ...formData, s3SecretKey: e.target.value })}
                        required
                      />
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  />
                  <Label htmlFor="isDefault">Set as default storage</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Adding..." : "Add Storage"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Hetzner StorageBox / BorgBackup Card */}
      <Card className="border-2 border-dashed">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Cloud className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <CardTitle>Hetzner StorageBox</CardTitle>
                <CardDescription>BorgBackup ile deduplicated offsite yedekleme</CardDescription>
              </div>
            </div>
            {borgStatus?.status?.connected && (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {borgLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !borgStatus?.ready ? (
            <div className="space-y-4">
              <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                <p className="text-sm font-medium text-yellow-600">Gereksinimler Eksik</p>
                <p className="text-xs text-muted-foreground mt-1">{borgStatus?.message}</p>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    {borgStatus?.borgInstalled ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                    <span>BorgBackup</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {borgStatus?.sshpassInstalled ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                    <span>sshpass</span>
                  </div>
                </div>
              </div>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                sudo apt install borgbackup sshpass
              </pre>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Storage Quota Info */}
              {borgStatus.storageQuota && (
                <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <PieChart className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">StorageBox Disk Usage</span>
                    </div>
                    <Badge variant="outline" className={borgStatus.storageQuota.usedPercent > 90 ? 'border-red-500 text-red-500' : borgStatus.storageQuota.usedPercent > 75 ? 'border-yellow-500 text-yellow-500' : 'border-green-500 text-green-500'}>
                      {borgStatus.storageQuota.usedPercent}% used
                    </Badge>
                  </div>
                  <Progress
                    value={borgStatus.storageQuota.usedPercent}
                    className="h-3 mb-3"
                  />
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Used</p>
                      <p className="font-semibold">{borgStatus.storageQuota.usedFormatted}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Free</p>
                      <p className="font-semibold text-green-600">{borgStatus.storageQuota.freeFormatted}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Total</p>
                      <p className="font-semibold">{borgStatus.storageQuota.totalFormatted}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Repository Status */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Archive className="h-3 w-3" />
                    Archive Count
                  </div>
                  <p className="text-lg font-semibold">{borgStatus.status?.archiveCount || 0}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <HardDrive className="h-3 w-3" />
                    Total Size
                  </div>
                  <p className="text-lg font-semibold">{borgStatus.status?.repoInfo?.totalSizeFormatted || '-'}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <HardDrive className="h-3 w-3" />
                    Deduplicated
                  </div>
                  <p className="text-lg font-semibold text-green-600">{borgStatus.status?.repoInfo?.uniqueSizeFormatted || '-'}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Clock className="h-3 w-3" />
                    Last Sync
                  </div>
                  <p className="text-sm font-medium">
                    {borgStatus.status?.lastSync
                      ? new Date(borgStatus.status.lastSync).toLocaleString('tr-TR')
                      : 'Never'}
                  </p>
                </div>
              </div>

              {/* Error Message */}
              {borgStatus.status?.lastError && (
                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  <p className="text-sm text-red-600">{borgStatus.status.lastError}</p>
                </div>
              )}

              {/* Live Sync Status */}
              {syncStatus && syncStatus.status !== 'idle' && (
                <div className="p-4 bg-muted/50 rounded-lg border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className={`h-4 w-4 ${['syncing', 'initializing', 'pruning', 'compacting'].includes(syncStatus.status) ? 'animate-pulse text-blue-500' : syncStatus.status === 'completed' ? 'text-green-500' : 'text-red-500'}`} />
                      <span className="font-medium">Sync Status</span>
                    </div>
                    <Badge className={getSyncStatusLabel(syncStatus.status).color}>
                      {getSyncStatusLabel(syncStatus.status).label}
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  {['syncing', 'initializing'].includes(syncStatus.status) && syncStatus.totalBytes > 0 && (
                    <div className="space-y-2">
                      <Progress
                        value={(syncStatus.bytesTransferred / syncStatus.totalBytes) * 100}
                        className="h-2"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatFileSize(syncStatus.bytesTransferred)} / {formatFileSize(syncStatus.totalBytes)}</span>
                        <span>{Math.round((syncStatus.bytesTransferred / syncStatus.totalBytes) * 100)}%</span>
                      </div>
                    </div>
                  )}

                  {/* Stats Grid */}
                  {['syncing', 'pruning', 'compacting'].includes(syncStatus.status) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Speed</p>
                          <p className="font-medium">{formatSpeed(syncStatus.transferSpeed)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">ETA</p>
                          <p className="font-medium">{formatDuration(syncStatus.estimatedTimeRemaining)}</p>
                        </div>
                      </div>
                      {syncStatus.bandwidthLimit && (
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Limit</p>
                            <p className="font-medium">{(syncStatus.bandwidthLimit / 1024).toFixed(1)} MB/s</p>
                          </div>
                        </div>
                      )}
                      {syncStatus.totalFiles > 0 && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Files</p>
                            <p className="font-medium">{syncStatus.totalFiles}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Current File */}
                  {syncStatus.currentFile && (
                    <div className="text-xs text-muted-foreground truncate">
                      <span className="font-medium">Current:</span> {syncStatus.currentFile}
                    </div>
                  )}

                  {/* Archive Name */}
                  {syncStatus.archiveName && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Archive:</span> <span className="font-mono">{syncStatus.archiveName}</span>
                    </div>
                  )}

                  {/* Error */}
                  {syncStatus.status === 'failed' && syncStatus.errorMessage && (
                    <div className="p-2 bg-red-500/10 rounded text-sm text-red-600">
                      {syncStatus.errorMessage}
                    </div>
                  )}

                  {/* Completed Info */}
                  {syncStatus.status === 'completed' && syncStatus.startedAt && syncStatus.completedAt && (
                    <div className="text-xs text-muted-foreground">
                      Completed in {formatDuration(Math.round((new Date(syncStatus.completedAt).getTime() - new Date(syncStatus.startedAt).getTime()) / 1000))}
                      {syncStatus.bytesTransferred > 0 && ` • ${formatFileSize(syncStatus.bytesTransferred)} transferred`}
                    </div>
                  )}

                  {/* Live Logs */}
                  {syncStatus.logs && syncStatus.logs.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Terminal className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">Live Logs</span>
                      </div>
                      <div className="bg-black/90 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
                        {syncStatus.logs.map((log, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-gray-500 flex-shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString('tr-TR')}
                            </span>
                            {log.level === 'error' && <XCircle className="h-3 w-3 text-red-400 flex-shrink-0 mt-0.5" />}
                            {log.level === 'warn' && <AlertTriangle className="h-3 w-3 text-yellow-400 flex-shrink-0 mt-0.5" />}
                            {log.level === 'success' && <CheckCircle className="h-3 w-3 text-green-400 flex-shrink-0 mt-0.5" />}
                            {log.level === 'info' && <Activity className="h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5" />}
                            <span className={
                              log.level === 'error' ? 'text-red-400' :
                              log.level === 'warn' ? 'text-yellow-400' :
                              log.level === 'success' ? 'text-green-400' :
                              'text-gray-300'
                            }>
                              {log.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Recent Archives */}
              {borgStatus.status?.archives && borgStatus.status.archives.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Recent Archives</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {borgStatus.status.archives.slice(-5).reverse().map((archive, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                        <span className="font-mono">{archive.name}</span>
                        <span className="text-muted-foreground">
                          {new Date(archive.start).toLocaleString('tr-TR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Backup Path Input */}
              {borgStatus.status?.initialized && (
                <div className="space-y-2">
                  <Label htmlFor="backupPath" className="text-sm">Backup Folder Path (WSL)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="backupPath"
                      value={borgBackupPath}
                      onChange={(e) => setBorgBackupPath(e.target.value)}
                      placeholder="/var/opt/mssql/backup"
                      className={`font-mono text-sm ${backupPathChanged ? 'border-yellow-500' : ''}`}
                    />
                    {backupPathChanged && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={saveBackupPath}
                        disabled={savingBackupPath}
                        className="whitespace-nowrap"
                      >
                        {savingBackupPath ? (
                          <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
                        ) : (
                          <><Save className="h-4 w-4 mr-1" /> Save Path</>
                        )}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    WSL path format: /mnt/c/... for Windows drives
                    {backupPathChanged && <span className="text-yellow-600 ml-2">(unsaved changes)</span>}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                {!borgStatus.status?.initialized ? (
                  <Button onClick={handleBorgInit} disabled={borgInitializing}>
                    {borgInitializing ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Initializing...</>
                    ) : (
                      <><Archive className="h-4 w-4 mr-2" /> Initialize Repository</>
                    )}
                  </Button>
                ) : (
                  <Button onClick={handleBorgSync} disabled={borgSyncing || !borgBackupPath}>
                    {borgSyncing ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Syncing...</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" /> Sync Now</>
                    )}
                  </Button>
                )}
                <Button variant="outline" onClick={fetchBorgStatus}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button variant="outline" onClick={openRestoreDialog}>
                  <Download className="h-4 w-4 mr-2" />
                  Restore
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Dialog - Full Screen */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="!max-w-none !w-screen !h-screen overflow-hidden flex flex-col !p-0 !rounded-none !border-0 !top-0 !left-0 !translate-x-0 !translate-y-0" showCloseButton={false}>
          {/* Header */}
          <div className="px-6 py-4 border-b bg-muted/30 flex items-center justify-between">
            <DialogHeader className="flex-1">
              <DialogTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileArchive className="h-6 w-6 text-primary" />
                </div>
                Backup Restore
                <Badge variant="outline" className="ml-2">Hetzner StorageBox</Badge>
              </DialogTitle>
              <DialogDescription>
                Select an archive and choose specific files to restore, or restore the entire backup
              </DialogDescription>
            </DialogHeader>
            <Button variant="ghost" size="icon" onClick={() => setRestoreDialogOpen(false)} className="h-10 w-10">
              <XCircle className="h-6 w-6" />
            </Button>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden grid grid-cols-3 gap-0">
            {/* Left Panel - Archives */}
            <div className="border-r bg-muted/20 flex flex-col overflow-hidden">
              <div className="p-4 border-b bg-background">
                <h3 className="font-semibold flex items-center gap-2">
                  <Archive className="h-4 w-4 text-primary" />
                  Backup Archives
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {restoreArchives.length} archive(s) available
                </p>
              </div>

              {loadingArchives ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading archives...</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {restoreArchives.map((archive, i) => (
                    <button
                      key={i}
                      onClick={() => selectArchive(archive.name)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedArchive === archive.name
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "hover:bg-muted bg-background"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Database className="h-4 w-4 flex-shrink-0" />
                        <span className="font-mono text-xs truncate">
                          {archive.name.replace('sql-backup-', '')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs opacity-70">
                        <Calendar className="h-3 w-3" />
                        {new Date(archive.start).toLocaleString("tr-TR")}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Middle Panel - File Browser */}
            <div className="col-span-2 flex flex-col overflow-hidden">
              {!selectedArchive ? (
                <div className="flex-1 flex items-center justify-center bg-muted/10">
                  <div className="text-center">
                    <Archive className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-muted-foreground">Select an Archive</h3>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Choose a backup archive from the left panel to browse its contents
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* File Browser Header */}
                  <div className="p-4 border-b bg-background space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          <FolderOpen className="h-4 w-4 text-primary" />
                          Archive Contents
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {filteredFiles.length} file(s) • {formatFileSize(totalArchiveSize)} total
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedFiles.size > 0 && (
                          <Badge variant="default" className="px-3 py-1">
                            {selectedFiles.size} selected ({formatFileSize(selectedFilesSize)})
                          </Badge>
                        )}
                        <Button variant="outline" size="sm" onClick={selectAllFiles}>
                          Select All
                        </Button>
                        <Button variant="outline" size="sm" onClick={clearFileSelection}>
                          Clear
                        </Button>
                      </div>
                    </div>

                    {/* Search Box */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search files..."
                        value={fileSearchQuery}
                        onChange={(e) => setFileSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* File List */}
                  {loadingContents ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Loading files...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto p-2">
                      {filteredFiles.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <File className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">
                              {fileSearchQuery ? "No files match your search" : "No files in this archive"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {filteredFiles.map((file, i) => {
                            const fileName = file.path.split('/').pop() || file.path
                            const isSelected = selectedFiles.has(file.path)
                            const isBackupFile = fileName.endsWith('.bak')

                            return (
                              <label
                                key={i}
                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                                  isSelected
                                    ? "bg-primary/10 border border-primary/30"
                                    : "hover:bg-muted border border-transparent"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleFileSelection(file.path)}
                                  className="h-4 w-4 rounded border-2"
                                />
                                <div className={`p-2 rounded ${isBackupFile ? 'bg-blue-500/10' : 'bg-muted'}`}>
                                  {isBackupFile ? (
                                    <Database className="h-4 w-4 text-blue-500" />
                                  ) : (
                                    <File className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-mono text-sm truncate" title={file.path}>
                                    {fileName}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate" title={file.path}>
                                    {file.path}
                                  </p>
                                </div>
                                <Badge variant="secondary" className="font-mono">
                                  {formatFileSize(file.size)}
                                </Badge>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-muted/30">
            <div className="flex items-center gap-4">
              {/* Destination Input */}
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Restore Destination</Label>
                <div className="relative">
                  <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={restoreDestination}
                    onChange={(e) => setRestoreDestination(e.target.value)}
                    placeholder="/mnt/c/Restore"
                    className="pl-9 font-mono"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="text-right min-w-[200px]">
                {selectedFiles.size > 0 ? (
                  <div>
                    <p className="text-sm font-medium">{selectedFiles.size} file(s) selected</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(selectedFilesSize)} to restore</p>
                  </div>
                ) : selectedArchive ? (
                  <div>
                    <p className="text-sm font-medium">Restore entire archive</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(totalArchiveSize)} total</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select an archive to continue</p>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleRestore}
                  disabled={!selectedArchive || !restoreDestination || restoring}
                  size="lg"
                >
                  {restoring ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Restoring...</>
                  ) : selectedFiles.size > 0 ? (
                    <><Download className="h-4 w-4 mr-2" /> Restore Selected</>
                  ) : (
                    <><Download className="h-4 w-4 mr-2" /> Restore All</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Storage Targets Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Local Storage Targets</h2>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : targets.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No storage targets configured. Add your first storage location to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {targets.map((target) => (
            <Card key={target.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="flex items-center gap-3">
                  {getStorageIcon(target.storageType)}
                  <div>
                    <CardTitle className="text-lg">{target.name}</CardTitle>
                    <CardDescription>{target.storageType}</CardDescription>
                  </div>
                </div>
                {target.isDefault && <Badge>Default</Badge>}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {target.config.localPath && (
                    <div>
                      <span className="text-muted-foreground">Path:</span>{" "}
                      <span className="font-mono">{target.config.localPath}</span>
                    </div>
                  )}
                  {target.config.s3Bucket && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Bucket:</span>{" "}
                        <span className="font-mono">{target.config.s3Bucket}</span>
                      </div>
                      {target.config.s3Endpoint && (
                        <div>
                          <span className="text-muted-foreground">Endpoint:</span>{" "}
                          <span className="font-mono">{target.config.s3Endpoint}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={() => handleDelete(target.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
