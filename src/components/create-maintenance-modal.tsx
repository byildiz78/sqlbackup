"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { toast } from "sonner"
import {
  Loader2,
  X,
  Plus,
  Search,
  Database,
  Server,
  Wrench,
  Clock,
  Calendar,
  CheckCircle,
  Shield,
  BarChart3,
  Settings2,
  Zap
} from "lucide-react"

interface Database {
  id: string
  name: string
  serverId: string
  server: { name: string }
}

interface CreateMaintenanceModalProps {
  databases: Database[]
  onSuccess: () => void
}

const MAINTENANCE_TYPES = [
  {
    value: "INDEX",
    label: "Index Optimization",
    description: "Rebuild or reorganize fragmented indexes to improve query performance",
    icon: BarChart3,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500",
    hasOptions: true
  },
  {
    value: "INTEGRITY",
    label: "Integrity Check",
    description: "Run DBCC CHECKDB to verify database integrity and detect corruption",
    icon: Shield,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500",
    hasOptions: false
  },
  {
    value: "STATS",
    label: "Update Statistics",
    description: "Update query optimizer statistics for better execution plans",
    icon: Zap,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500",
    hasOptions: false
  }
]

const SCHEDULE_PRESETS = [
  { label: "Daily at 2 AM", value: "0 2 * * *", description: "Runs every day at 02:00" },
  { label: "Daily at 4 AM", value: "0 4 * * *", description: "Runs every day at 04:00" },
  { label: "Weekly (Sunday 2 AM)", value: "0 2 * * 0", description: "Runs every Sunday at 02:00" },
  { label: "Weekly (Saturday 3 AM)", value: "0 3 * * 6", description: "Runs every Saturday at 03:00" },
  { label: "Monthly (1st at 2 AM)", value: "0 2 1 * *", description: "Runs on the 1st of each month" },
  { label: "Monthly (15th at 2 AM)", value: "0 2 15 * *", description: "Runs on the 15th of each month" },
  { label: "Custom", value: "custom", description: "Enter your own cron expression" },
]

export function CreateMaintenanceModal({ databases, onSuccess }: CreateMaintenanceModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>("")
  const [maintenanceType, setMaintenanceType] = useState("INDEX")
  const [schedulePreset, setSchedulePreset] = useState("0 2 * * 0")
  const [customCron, setCustomCron] = useState("")

  // Index options
  const [fragmentationLevel1, setFragmentationLevel1] = useState(5)
  const [fragmentationLevel2, setFragmentationLevel2] = useState(30)

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

  // Get selected maintenance type info
  const selectedType = MAINTENANCE_TYPES.find(t => t.value === maintenanceType)

  const resetForm = () => {
    setSelectedDatabaseId("")
    setMaintenanceType("INDEX")
    setSchedulePreset("0 2 * * 0")
    setCustomCron("")
    setFragmentationLevel1(5)
    setFragmentationLevel2(30)
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
      const options = maintenanceType === "INDEX" ? {
        fragmentationLevel1,
        fragmentationLevel2
      } : undefined

      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId: selectedDatabaseId,
          maintenanceType,
          scheduleCron: effectiveCron,
          options
        })
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to create job")
        return
      }

      toast.success("Maintenance job created successfully")
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
            <div className="p-2 bg-cyan-500/10 rounded-lg">
              <Wrench className="h-6 w-6 text-cyan-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Create Maintenance Job</h2>
              <p className="text-sm text-muted-foreground">
                Schedule index optimization, integrity checks, or statistics updates
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
                <Database className="h-4 w-4 text-cyan-500" />
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
                                ? "bg-cyan-500/10 border-l-4 border-l-cyan-500"
                                : "hover:bg-muted/50 border-l-4 border-l-transparent"
                            }`}
                            onClick={() => setSelectedDatabaseId(db.id)}
                          >
                            <div className={`p-1.5 rounded ${isSelected ? 'bg-cyan-500/20' : 'bg-muted'}`}>
                              <Database className={`h-4 w-4 ${isSelected ? 'text-cyan-500' : 'text-muted-foreground'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`font-medium truncate ${isSelected ? 'text-cyan-600' : ''}`}>
                                {db.name}
                              </p>
                            </div>
                            {isSelected && (
                              <CheckCircle className="h-5 w-5 text-cyan-500 shrink-0" />
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
                <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/10 rounded-lg">
                      <Database className="h-5 w-5 text-cyan-500" />
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

              {/* Maintenance Type Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Maintenance Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  {MAINTENANCE_TYPES.map(type => {
                    const Icon = type.icon
                    const isSelected = maintenanceType === type.value
                    return (
                      <div
                        key={type.value}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? `${type.borderColor} ${type.bgColor}`
                            : "border-muted hover:border-muted-foreground/30 hover:bg-muted/30"
                        }`}
                        onClick={() => setMaintenanceType(type.value)}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`p-2 rounded-lg ${type.bgColor}`}>
                            <Icon className={`h-5 w-5 ${type.color}`} />
                          </div>
                          {isSelected && (
                            <CheckCircle className={`h-5 w-5 ${type.color} ml-auto`} />
                          )}
                        </div>
                        <p className="font-semibold text-sm">{type.label}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{type.description}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Index Options */}
              {maintenanceType === "INDEX" && (
                <div className="space-y-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-blue-500" />
                    <Label className="font-semibold">Index Optimization Settings</Label>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <Label>Reorganize Threshold</Label>
                        <Badge variant="outline">{fragmentationLevel1}%</Badge>
                      </div>
                      <Slider
                        value={[fragmentationLevel1]}
                        onValueChange={([v]) => setFragmentationLevel1(v)}
                        min={1}
                        max={50}
                        step={1}
                        className="py-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        Reorganize indexes with fragmentation above this level
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <Label>Rebuild Threshold</Label>
                        <Badge variant="outline">{fragmentationLevel2}%</Badge>
                      </div>
                      <Slider
                        value={[fragmentationLevel2]}
                        onValueChange={([v]) => setFragmentationLevel2(v)}
                        min={10}
                        max={80}
                        step={1}
                        className="py-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        Rebuild indexes with fragmentation above this level
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
                            ? "border-cyan-500 bg-cyan-500/5"
                            : "border-muted hover:border-muted-foreground/30 hover:bg-muted/30"
                        }`}
                        onClick={() => setSchedulePreset(preset.value)}
                      >
                        <div className="flex items-center justify-between">
                          <p className={`font-medium text-sm ${isSelected ? 'text-cyan-600' : ''}`}>
                            {preset.label}
                          </p>
                          {isSelected && <CheckCircle className="h-4 w-4 text-cyan-500" />}
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
                      <span className="font-medium">{selectedType?.label}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Schedule:</span>{" "}
                      <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{effectiveCron}</code>
                    </div>
                    {maintenanceType === "INDEX" && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Thresholds:</span>{" "}
                        <span className="font-medium">Reorganize at {fragmentationLevel1}%, Rebuild at {fragmentationLevel2}%</span>
                      </div>
                    )}
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
