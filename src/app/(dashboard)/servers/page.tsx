"use client"

import { useState, useEffect, useMemo } from "react"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Plus, MoreHorizontal, RefreshCw, Trash2, TestTube, Database, Wrench, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { DataTable, Column } from "@/components/data-table"

interface SqlServer {
  id: string
  name: string
  host: string
  port: number
  username: string
  isActive: boolean
  _count: {
    databases: number
  }
}

interface OlaStatus {
  installed: boolean
  version: string | null
  loading: boolean
}

export default function ServersPage() {
  const [servers, setServers] = useState<SqlServer[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    host: "",
    port: "1433",
    username: "",
    password: ""
  })
  const [submitting, setSubmitting] = useState(false)
  const [olaStatuses, setOlaStatuses] = useState<Record<string, OlaStatus>>({})

  useEffect(() => {
    fetchServers()
  }, [])

  useEffect(() => {
    servers.forEach(server => {
      if (!olaStatuses[server.id]) {
        checkOlaStatus(server.id)
      }
    })
  }, [servers])

  async function fetchServers() {
    try {
      const res = await fetch("/api/servers")
      const data = await res.json()
      setServers(data)
    } catch {
      toast.error("Failed to fetch servers")
    } finally {
      setLoading(false)
    }
  }

  async function checkOlaStatus(serverId: string) {
    setOlaStatuses(prev => ({
      ...prev,
      [serverId]: { installed: false, version: null, loading: true }
    }))

    try {
      const res = await fetch(`/api/servers/${serverId}/install-ola`)
      const data = await res.json()

      setOlaStatuses(prev => ({
        ...prev,
        [serverId]: {
          installed: data.installed || false,
          version: data.version || null,
          loading: false
        }
      }))
    } catch {
      setOlaStatuses(prev => ({
        ...prev,
        [serverId]: { installed: false, version: null, loading: false }
      }))
    }
  }

  async function handleInstallOla(serverId: string) {
    toast.info("Installing Ola Hallengren MaintenanceSolution...")

    setOlaStatuses(prev => ({
      ...prev,
      [serverId]: { ...prev[serverId], loading: true }
    }))

    try {
      const res = await fetch(`/api/servers/${serverId}/install-ola`, {
        method: "POST"
      })
      const data = await res.json()

      if (data.success) {
        toast.success(data.message)
        setOlaStatuses(prev => ({
          ...prev,
          [serverId]: {
            installed: true,
            version: data.version || "Installed",
            loading: false
          }
        }))
      } else {
        toast.error(data.error || "Installation failed")
        setOlaStatuses(prev => ({
          ...prev,
          [serverId]: { ...prev[serverId], loading: false }
        }))
      }
    } catch {
      toast.error("Installation failed")
      setOlaStatuses(prev => ({
        ...prev,
        [serverId]: { ...prev[serverId], loading: false }
      }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          port: parseInt(formData.port)
        })
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Failed to add server")
        return
      }

      toast.success("Server added successfully")
      setDialogOpen(false)
      setFormData({ name: "", host: "", port: "1433", username: "", password: "" })
      fetchServers()
    } catch {
      toast.error("Failed to add server")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTest(id: string) {
    toast.info("Testing connection...")
    try {
      const res = await fetch(`/api/servers/${id}/test`, { method: "POST" })
      const data = await res.json()

      if (data.success) {
        toast.success("Connection successful!")
      } else {
        toast.error(data.message || "Connection failed")
      }
    } catch {
      toast.error("Connection test failed")
    }
  }

  async function handleSync(id: string) {
    toast.info("Syncing databases...")
    try {
      const res = await fetch(`/api/servers/${id}/sync`, { method: "POST" })
      const data = await res.json()

      if (data.success) {
        toast.success(data.message)
        fetchServers()
      } else {
        toast.error(data.error || "Sync failed")
      }
    } catch {
      toast.error("Sync failed")
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this server?")) return

    try {
      const res = await fetch(`/api/servers/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Server deleted")
        fetchServers()
      } else {
        toast.error("Failed to delete server")
      }
    } catch {
      toast.error("Failed to delete server")
    }
  }

  const columns: Column<SqlServer>[] = useMemo(() => [
    {
      key: "name",
      header: "Name",
      cell: (server) => <span className="font-medium">{server.name}</span>
    },
    {
      key: "host",
      header: "Host"
    },
    {
      key: "port",
      header: "Port",
      sortable: true
    },
    {
      key: "_count.databases",
      header: "Databases",
      sortValue: (server) => server._count.databases,
      cell: (server) => (
        <div className="flex items-center gap-1">
          <Database className="h-4 w-4 text-muted-foreground" />
          {server._count.databases}
        </div>
      )
    },
    {
      key: "olaStatus",
      header: "Ola Hallengren",
      sortable: false,
      searchable: false,
      cell: (server) => {
        const status = olaStatuses[server.id]
        if (status?.loading) {
          return (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Checking...</span>
            </div>
          )
        }
        if (status?.installed) {
          return (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs">Installed</span>
            </div>
          )
        }
        return (
          <div className="flex items-center gap-1 text-yellow-600">
            <XCircle className="h-4 w-4" />
            <span className="text-xs">Not installed</span>
          </div>
        )
      }
    },
    {
      key: "isActive",
      header: "Status",
      cell: (server) => (
        <Badge variant={server.isActive ? "default" : "secondary"}>
          {server.isActive ? "Active" : "Inactive"}
        </Badge>
      )
    },
    {
      key: "actions",
      header: "Actions",
      sortable: false,
      searchable: false,
      className: "w-[100px]",
      cell: (server) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleTest(server.id)}>
              <TestTube className="h-4 w-4 mr-2" />
              Test Connection
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSync(server.id)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Databases
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleInstallOla(server.id)}
              disabled={olaStatuses[server.id]?.loading}
            >
              <Wrench className="h-4 w-4 mr-2" />
              {olaStatuses[server.id]?.installed ? "Reinstall Ola" : "Install Ola"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => handleDelete(server.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ], [olaStatuses])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">SQL Servers</h1>
          <p className="text-muted-foreground">Manage your SQL Server connections</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Server
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add SQL Server</DialogTitle>
              <DialogDescription>
                Enter the connection details for your SQL Server instance
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Display Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Production Server"
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="host">Host</Label>
                    <Input
                      id="host"
                      value={formData.host}
                      onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                      placeholder="localhost or IP"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="sa"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Adding..." : "Add Server"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected Servers</CardTitle>
          <CardDescription>
            {servers.length} server{servers.length !== 1 ? "s" : ""} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={servers}
            columns={columns}
            loading={loading}
            searchPlaceholder="Search servers..."
            emptyMessage="No servers configured. Add your first SQL Server to get started."
            pageSize={10}
          />
        </CardContent>
      </Card>
    </div>
  )
}
