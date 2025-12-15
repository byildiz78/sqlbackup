"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Loader2,
  X,
  Plus,
  Search,
  Database,
  Server,
  HardDrive,
  RefreshCw,
  FileArchive,
  Clock,
  Calendar,
  CheckCircle,
  FolderOpen,
  Trash2
} from "lucide-react"

interface Database {
  id: string
  name: string
  serverId: string
  server: { name: string }
}

interface CreateBackupModalProps {
  databases: Database[]
  onSuccess: () => void
}

const BACKUP_TYPES = [
  {
    value: "FULL",
    label: "Full Backup",
    description: "Complete database backup",
    icon: HardDrive,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500"
  },
  {
    value: "DIFF",
    label: "Differential",
    description: "Changes since last full backup",
    icon: RefreshCw,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500"
  },
  {
    value: "LOG",
    label: "Transaction Log",
    description: "Transaction log backup",
    icon: FileArchive,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500"
  }
]

const SCHEDULE_PRESETS = [
  { label: "Every hour", value: "0 * * * *", description: "Runs at minute 0 of every hour" },
  { label: "Every 6 hours", value: "0 */6 * * *", description: "Runs at 00:00, 06:00, 12:00, 18:00" },
  { label: "Daily at midnight", value: "0 0 * * *", description: "Runs every day at 00:00" },
  { label: "Daily at 2 AM", value: "0 2 * * *", description: "Runs every day at 02:00" },
  { label: "Daily at 6 AM", value: "0 6 * * *", description: "Runs every day at 06:00" },
  { label: "Weekly (Sunday midnight)", value: "0 0 * * 0", description: "Runs every Sunday at 00:00" },
  { label: "Weekly (Saturday 2 AM)", value: "0 2 * * 6", description: "Runs every Saturday at 02:00" },
  { label: "Custom", value: "custom", description: "Enter your own cron expression" },
]

export function CreateBackupModal({ databases, onSuccess }: CreateBackupModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>("")
  const [backupType, setBackupType] = useState("FULL")
  const [schedulePreset, setSchedulePreset] = useState("0 0 * * *")
  const [customCron, setCustomCron] = useState("")
  const [storageTarget, setStorageTarget] = useState("default")
  const [retentionDays, setRetentionDays] = useState(30)
  const [compression, setCompression] = useState(true)
  const [checksum, setChecksum] = useState(true)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")

  // Group databases by server
  const serverGroups = useMemo(() => {
    const groups = new Map<string, { serverId: string; serverName: string; databases: Database[] }>()

    databases.forEach(db => {
      if (!groups.has(db.serverId)) {
        groups.set(db.serverId, {
          serverId: db.serverId,
          serverName: db.server.name,
          databases: []
        })
      }
      groups.get(db.serverId)!.databases.push(db)
    })

    return Array.from(groups.values()).sort((a, b) => a.serverName.localeCompare(b.serverName))
  }, [databases])

  // Filter databases by search
  const filteredServerGroups = useMemo(() => {
    if (!searchQuery.trim()) return serverGroups

    const query = searchQuery.toLowerCase()
    return serverGroups
      .map(group => ({
        ...group,
        databases: group.databases.filter(db =>
          db.name.toLowerCase().includes(query) ||
          group.serverName.toLowerCase().includes(query)
        )
      }))
      .filter(group => group.databases.length > 0)
  }, [serverGroups, searchQuery])

  // Get selected database info
  const selectedDatabase = databases.find(db => db.id === selectedDatabaseId)

  // Get effective cron expression
  const effectiveCron = schedulePreset === "custom" ? customCron : schedulePreset

  const resetForm = () => {
    setSelectedDatabaseId("")
    setBackupType("FULL")
    setSchedulePreset("0 0 * * *")
    setCustomCron("")
    setStorageTarget("default")
    setRetentionDays(30)
    setCompression(true)
    setChecksum(true)
    setSearchQuery("")
  }

  const handleSubmit = async () => {
    if (!selectedDatabaseId) {
      toast.error("Please select a database")
      return
    }

    if (!effectiveCron) {
      toast.error("Please select or enter a schedule")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId: selectedDatabaseId,
          backupType,
          scheduleCron: effectiveCron,
          storageTarget,
          compression,
          checksum,
          retentionDays
        })
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to create job")
        return
      }

      toast.success("Backup job created successfully")
      setIsOpen(false)
      resetForm()
      onSuccess()
    } catch {
      toast.error("Failed to create job")
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Create Job
      </Button>
    )
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Create Job
      </Button>

      {/* Modal Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal Content */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <HardDrive className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Create Backup Job</h2>
              <p className="text-sm text-muted-foreground">
                Schedule a new backup job for a database
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="grid grid-cols-5 gap-0 h-[calc(90vh-180px)] overflow-hidden">
          {/* Left Column - Database Selection (2/5) */}
          <div className="col-span-2 border-r flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-background">
              <Label className="text-base font-semibold flex items-center gap-2 mb-3">
                <Database className="h-4 w-4 text-primary" />
                Select Database
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search databases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {databases.length} database(s) available
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredServerGroups.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No databases found</p>
                </div>
              ) : (
                filteredServerGroups.map(group => (
                  <div key={group.serverId} className="border-b last:border-b-0">
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 sticky top-0">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{group.serverName}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {group.databases.length}
                      </Badge>
                    </div>
                    <div className="divide-y">
                      {group.databases.map(db => {
                        const isSelected = selectedDatabaseId === db.id
                        return (
                          <div
                            key={db.id}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${
                              isSelected
                                ? "bg-primary/10 border-l-4 border-l-primary"
                                : "hover:bg-muted/50 border-l-4 border-l-transparent"
                            }`}
                            onClick={() => setSelectedDatabaseId(db.id)}
                          >
                            <div className={`p-1.5 rounded ${isSelected ? 'bg-primary/20' : 'bg-muted'}`}>
                              <Database className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`font-medium truncate ${isSelected ? 'text-primary' : ''}`}>
                                {db.name}
                              </p>
                            </div>
                            {isSelected && (
                              <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column - Settings (3/5) */}
          <div className="col-span-3 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Selected Database Preview */}
              {selectedDatabase && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Database className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{selectedDatabase.name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Server className="h-3 w-3" />
                        {selectedDatabase.server.name}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Backup Type Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Backup Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  {BACKUP_TYPES.map(type => {
                    const Icon = type.icon
                    const isSelected = backupType === type.value
                    return (
                      <div
                        key={type.value}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? `${type.borderColor} ${type.bgColor}`
                            : "border-muted hover:border-muted-foreground/30 hover:bg-muted/30"
                        }`}
                        onClick={() => setBackupType(type.value)}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`p-2 rounded-lg ${type.bgColor}`}>
                            <Icon className={`h-5 w-5 ${type.color}`} />
                          </div>
                          {isSelected && (
                            <CheckCircle className={`h-5 w-5 ${type.color} ml-auto`} />
                          )}
                        </div>
                        <p className="font-semibold">{type.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Schedule Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Schedule
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {SCHEDULE_PRESETS.map(preset => {
                    const isSelected = schedulePreset === preset.value
                    return (
                      <div
                        key={preset.value}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/30 hover:bg-muted/30"
                        }`}
                        onClick={() => setSchedulePreset(preset.value)}
                      >
                        <div className="flex items-center justify-between">
                          <p className={`font-medium text-sm ${isSelected ? 'text-primary' : ''}`}>
                            {preset.label}
                          </p>
                          {isSelected && <CheckCircle className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                      </div>
                    )
                  })}
                </div>

                {schedulePreset === "custom" && (
                  <div className="mt-3">
                    <Input
                      placeholder="Enter cron expression (e.g., 0 2 * * *)"
                      value={customCron}
                      onChange={(e) => setCustomCron(e.target.value)}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Format: minute hour day month weekday
                    </p>
                  </div>
                )}
              </div>

              {/* Additional Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    Storage Path
                  </Label>
                  <Input
                    value={storageTarget}
                    onChange={(e) => setStorageTarget(e.target.value)}
                    placeholder="default"
                  />
                  <p className="text-xs text-muted-foreground">
                    &quot;default&quot; uses SQL Server&apos;s backup folder
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Retention (days)
                  </Label>
                  <Input
                    type="number"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(parseInt(e.target.value) || 30)}
                    min={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-delete backups older than this
                  </p>
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={compression}
                    onChange={(e) => setCompression(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <span className="text-sm">Enable Compression</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checksum}
                    onChange={(e) => setChecksum(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <span className="text-sm">Enable Checksum</span>
                </label>
              </div>

              {/* Summary */}
              {selectedDatabase && effectiveCron && (
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <p className="font-semibold mb-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Job Summary
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Database:</span>{" "}
                      <span className="font-medium">{selectedDatabase.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Server:</span>{" "}
                      <span className="font-medium">{selectedDatabase.server.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Type:</span>{" "}
                      <span className="font-medium">{BACKUP_TYPES.find(t => t.value === backupType)?.label}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Schedule:</span>{" "}
                      <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{effectiveCron}</code>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <Button variant="outline" onClick={() => { setIsOpen(false); resetForm() }}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !selectedDatabaseId || !effectiveCron}
                className="min-w-[140px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Job
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
