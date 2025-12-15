"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Info, Database, Server, Shield, Github } from "lucide-react"

export function AboutTab() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            <CardTitle>Application Info</CardTitle>
          </div>
          <CardDescription>About this application</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Version</span>
            <Badge variant="secondary">1.0.0</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Environment</span>
            <Badge variant="outline">{process.env.NODE_ENV}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Framework</span>
            <span>Next.js 15</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Database</span>
            <span>PostgreSQL + Prisma</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>Backup Engine</CardTitle>
          </div>
          <CardDescription>SQL Server backup technology</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Primary Engine</span>
            <span>Ola Hallengren Scripts</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Fallback</span>
            <span>Native T-SQL</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Remote Storage</span>
            <span>BorgBackup + Hetzner</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Compression</span>
            <span>LZ4 (Fast)</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            <CardTitle>System Components</CardTitle>
          </div>
          <CardDescription>Required services and tools</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Required:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>- SQL Server (2016+)</li>
              <li>- Node.js 18+</li>
              <li>- PostgreSQL</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Optional:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>- BorgBackup (for remote sync)</li>
              <li>- sshpass (for Hetzner connection)</li>
              <li>- WSL (for Windows)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>Security features</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>- Encrypted backup archives (repokey-blake2)</li>
              <li>- Secure SSH connections</li>
              <li>- Role-based access control</li>
              <li>- Session management with NextAuth</li>
              <li>- Password hashing with bcrypt</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
