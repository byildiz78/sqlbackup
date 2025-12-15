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
import { Loader2, Check, X, Layers, Search, Server, Database } from "lucide-react"

interface Database {
  id: string
  name: string
  serverId: string
  server: { name: string }
}

interface BulkBackupModalProps {
  databases: Database[]
  onSuccess: () => void
}

export function BulkBackupModal({ databases, onSuccess }: BulkBackupModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")

  const [backupType, setBackupType] = useState<"FULL" | "DIFF">("FULL")
  const [scheduleType, setScheduleType] = useState<"daily" | "weekly">("daily")
  const [startHour, setStartHour] = useState(22)
  const [windowHours, setWindowHours] = useState(8)
  const [weekDay, setWeekDay] = useState(6)
  const [storageTarget, setStorageTarget] = useState("default")
  const [retentionDays, setRetentionDays] = useState(30)

  const servers = useMemo(() => {
    const serverMap = new Map<string, string>()
    databases.forEach(db => serverMap.set(db.serverId, db.server.name))
    return Array.from(serverMap.entries()).map(([id, name]) => ({ id, name }))
  }, [databases])

  // Filter databases by search
  const filteredServers = useMemo(() => {
    if (!searchQuery.trim()) return servers

    const query = searchQuery.toLowerCase()
    return servers.filter(server => {
      const serverDbs = databases.filter(db => db.serverId === server.id)
      return server.name.toLowerCase().includes(query) ||
        serverDbs.some(db => db.name.toLowerCase().includes(query))
    })
  }, [servers, databases, searchQuery])

  const getFilteredDatabases = (serverId: string) => {
    const serverDbs = databases.filter(db => db.serverId === serverId)
    if (!searchQuery.trim()) return serverDbs

    const query = searchQuery.toLowerCase()
    const serverName = servers.find(s => s.id === serverId)?.name || ""

    // If server matches, show all its databases
    if (serverName.toLowerCase().includes(query)) return serverDbs

    // Otherwise filter by database name
    return serverDbs.filter(db => db.name.toLowerCase().includes(query))
  }

  const toggleDatabase = (id: string) => {
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

  const toggleServer = (serverId: string) => {
    const serverDbIds = databases.filter(db => db.serverId === serverId).map(db => db.id)
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = serverDbIds.every(id => next.has(id))
      if (allSelected) {
        serverDbIds.forEach(id => next.delete(id))
      } else {
        serverDbIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === databases.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(databases.map(db => db.id)))
    }
  }

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one database")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/backups/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseIds: Array.from(selectedIds),
          backupType,
          scheduleType,
          startHour,
          windowHours,
          weekDay,
          storageTarget,
          compression: true,
          checksum: true,
          retentionDays
        })
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Failed to create jobs")
        return
      }

      toast.success(`Created ${data.summary.created} jobs (${data.summary.skipped} skipped)`)
      setIsOpen(false)
      setSelectedIds(new Set())
      onSuccess()
    } catch {
      toast.error("Failed to create jobs")
    } finally {
      setSubmitting(false)
    }
  }

  const intervalMinutes = selectedIds.size > 0
    ? Math.round((windowHours * 60) / selectedIds.size)
    : 0

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

  if (!isOpen) {
    return (
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <Layers className="h-4 w-4 mr-2" />
        Bulk Create
      </Button>
    )
  }

  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <Layers className="h-4 w-4 mr-2" />
        Bulk Create
      </Button>

      {/* Modal Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal Content */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">Bulk Create Backup Jobs</h2>
            <p className="text-sm text-muted-foreground">
              Create backup jobs for multiple databases with staggered schedules
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-6 p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Left Column - Database Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Database className="h-4 w-4" />
                Select Databases
              </Label>
              <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                {selectedIds.size === databases.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search databases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="border rounded-lg max-h-72 overflow-y-auto">
              {filteredServers.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No databases found
                </div>
              ) : (
                filteredServers.map(server => {
                  const serverDbs = getFilteredDatabases(server.id)
                  const allServerDbs = databases.filter(db => db.serverId === server.id)
                  const selectedCount = allServerDbs.filter(db => selectedIds.has(db.id)).length
                  const allSelected = selectedCount === allServerDbs.length && allServerDbs.length > 0

                  if (serverDbs.length === 0) return null

                  return (
                    <div key={server.id} className="border-b last:border-b-0">
                      <div
                        className="flex items-center gap-2 p-2 bg-muted/50 cursor-pointer hover:bg-muted sticky top-0"
                        onClick={() => toggleServer(server.id)}
                      >
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleServer(server.id)}
                          className="h-4 w-4"
                        />
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{server.name}</span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {selectedCount}/{allServerDbs.length}
                        </Badge>
                      </div>
                      <div className="divide-y">
                        {serverDbs.map(db => (
                          <div
                            key={db.id}
                            className="flex items-center gap-2 p-2 pl-8 cursor-pointer hover:bg-muted/30"
                            onClick={() => toggleDatabase(db.id)}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(db.id)}
                              onChange={() => toggleDatabase(db.id)}
                              className="h-4 w-4"
                            />
                            <span className="text-sm">{db.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {selectedIds.size} database(s) selected
            </p>
          </div>

          {/* Right Column - Settings */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Backup Type</Label>
              <Select value={backupType} onValueChange={(v) => setBackupType(v as "FULL" | "DIFF")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL">Full Backup</SelectItem>
                  <SelectItem value="DIFF">Differential Backup</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Schedule Type</Label>
              <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as "weekly" | "daily")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scheduleType === "weekly" && (
              <div className="space-y-2">
                <Label>Day of Week</Label>
                <Select value={weekDay.toString()} onValueChange={(v) => setWeekDay(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dayNames.map((day, i) => (
                      <SelectItem key={i} value={i.toString()}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Hour</Label>
                <Select value={startHour.toString()} onValueChange={(v) => setStartHour(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {i.toString().padStart(2, '0')}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Window (hours)</Label>
                <Select value={windowHours.toString()} onValueChange={(v) => setWindowHours(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 4, 6, 8, 10, 12].map(h => (
                      <SelectItem key={h} value={h.toString()}>{h} hours</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium mb-1">Schedule Preview:</p>
              <p className="text-muted-foreground">
                {selectedIds.size} jobs will run between{" "}
                <span className="font-medium">{startHour.toString().padStart(2, '0')}:00</span>
                {" "}and{" "}
                <span className="font-medium">{((startHour + windowHours) % 24).toString().padStart(2, '0')}:00</span>
                {scheduleType === "weekly" && <span> every {dayNames[weekDay]}</span>}
                {scheduleType === "daily" && " every day"}
              </p>
              {selectedIds.size > 0 && (
                <p className="text-muted-foreground mt-1">
                  ~{intervalMinutes} minutes between each job
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Storage Path</Label>
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
              <Label>Retention (days)</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(parseInt(e.target.value) || 30)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || selectedIds.size === 0}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Create {selectedIds.size} Jobs
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
