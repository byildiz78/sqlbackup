"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
  Loader2,
  X,
  Save,
  Database,
  Server,
  HardDrive,
  RefreshCw,
  FileArchive,
  Clock,
  Calendar,
  CheckCircle,
  FolderOpen,
  Trash2,
  Edit
} from "lucide-react"

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
}

interface EditBackupModalProps {
  job: BackupJob
  onSuccess: () => void
  onClose: () => void
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

const FREQUENCY_OPTIONS = [
  { value: "hourly", label: "Hourly", description: "Every hour" },
  { value: "daily", label: "Daily", description: "Once a day" },
  { value: "weekly", label: "Weekly", description: "Once a week" },
  { value: "monthly", label: "Monthly", description: "Once a month" },
  { value: "custom", label: "Custom", description: "Cron expression" },
]

const WEEKDAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

function parseCronToSchedule(cron: string): { frequency: string; time: string; weekday: string; monthday: string } {
  const parts = cron.split(' ')
  if (parts.length !== 5) return { frequency: "custom", time: "02:00", weekday: "0", monthday: "1" }

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts

  // Hourly
  if (hour === '*' || hour.startsWith('*/')) {
    return { frequency: "hourly", time: `00:${minute.padStart(2, '0')}`, weekday: "0", monthday: "1" }
  }

  // Weekly
  if (dayOfWeek !== '*' && dayOfMonth === '*') {
    return { frequency: "weekly", time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, weekday: dayOfWeek, monthday: "1" }
  }

  // Monthly
  if (dayOfMonth !== '*') {
    return { frequency: "monthly", time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, weekday: "0", monthday: dayOfMonth }
  }

  // Daily
  return { frequency: "daily", time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, weekday: "0", monthday: "1" }
}

export function EditBackupModal({ job, onSuccess, onClose }: EditBackupModalProps) {
  const [submitting, setSubmitting] = useState(false)

  // Parse existing schedule
  const parsedSchedule = parseCronToSchedule(job.scheduleCron)

  // Form state
  const [backupType, setBackupType] = useState(job.backupType)
  const [frequency, setFrequency] = useState(parsedSchedule.frequency)
  const [scheduleTime, setScheduleTime] = useState(parsedSchedule.time)
  const [weekday, setWeekday] = useState(parsedSchedule.weekday)
  const [monthday, setMonthday] = useState(parsedSchedule.monthday)
  const [customCron, setCustomCron] = useState(job.scheduleCron)
  const [storageTarget, setStorageTarget] = useState(job.storageTarget)
  const [retentionDays, setRetentionDays] = useState(job.retentionDays)
  const [compression, setCompression] = useState(job.compression)
  const [checksum, setChecksum] = useState(job.checksum)

  // Build cron expression from schedule parts
  function buildCronExpression(): string {
    if (frequency === "custom") return customCron

    const [hour, minute] = scheduleTime.split(':')

    switch (frequency) {
      case "hourly":
        return `${minute} * * * *`
      case "daily":
        return `${minute} ${hour} * * *`
      case "weekly":
        return `${minute} ${hour} * * ${weekday}`
      case "monthly":
        return `${minute} ${hour} ${monthday} * *`
      default:
        return customCron
    }
  }

  const effectiveCron = buildCronExpression()

  const handleSubmit = async () => {
    if (!effectiveCron) {
      toast.error("Please select or enter a schedule")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/backups/${job.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        toast.error(data.error || "Failed to update job")
        return
      }

      toast.success("Backup job updated successfully")
      onSuccess()
      onClose()
    } catch {
      toast.error("Failed to update job")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Modal Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Edit className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Edit Backup Job</h2>
              <p className="text-sm text-muted-foreground">
                Modify backup job settings
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-6 max-h-[calc(90vh-180px)]">
          {/* Database Info (Read-only) */}
          <div className="p-4 bg-muted/50 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{job.database.name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  {job.database.server.name}
                </p>
              </div>
            </div>
          </div>

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
          <div className="space-y-4">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Schedule
            </Label>

            {/* Frequency Selection */}
            <div className="grid grid-cols-5 gap-2">
              {FREQUENCY_OPTIONS.map(option => {
                const isSelected = frequency === option.value
                return (
                  <div
                    key={option.value}
                    className={`p-3 rounded-lg border cursor-pointer transition-all text-center ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/30 hover:bg-muted/30"
                    }`}
                    onClick={() => setFrequency(option.value)}
                  >
                    <p className={`font-medium text-sm ${isSelected ? 'text-primary' : ''}`}>
                      {option.label}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Time and Day Selection */}
            {frequency !== "custom" && (
              <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
                {frequency !== "hourly" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Time</Label>
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}

                {frequency === "hourly" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">At minute</Label>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      value={parseInt(scheduleTime.split(':')[1]) || 0}
                      onChange={(e) => setScheduleTime(`00:${e.target.value.padStart(2, '0')}`)}
                      className="w-20"
                    />
                  </div>
                )}

                {frequency === "weekly" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Day</Label>
                    <select
                      value={weekday}
                      onChange={(e) => setWeekday(e.target.value)}
                      className="h-9 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      {WEEKDAYS.map(day => (
                        <option key={day.value} value={day.value}>{day.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {frequency === "monthly" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Day of month</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={monthday}
                      onChange={(e) => setMonthday(e.target.value)}
                      className="w-20"
                    />
                  </div>
                )}

                <div className="ml-auto text-right">
                  <Label className="text-xs text-muted-foreground">Cron</Label>
                  <code className="block text-sm font-mono bg-muted px-2 py-1 rounded">{effectiveCron}</code>
                </div>
              </div>
            )}

            {/* Custom Cron Input */}
            {frequency === "custom" && (
              <div className="space-y-2">
                <Input
                  placeholder="Enter cron expression (e.g., 0 2 * * *)"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
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
          <div className="p-4 bg-muted/50 rounded-lg border">
            <p className="font-semibold mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Job Summary
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Database:</span>{" "}
                <span className="font-medium">{job.database.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Server:</span>{" "}
                <span className="font-medium">{job.database.server.name}</span>
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
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !effectiveCron}
            className="min-w-[140px]"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
