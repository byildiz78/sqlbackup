'use client'

import { Server, Clock, Cpu, HardDrive } from 'lucide-react'
import type { ServerInfo } from '@/lib/sql-health/types'

interface ServerInfoCardProps {
  info: ServerInfo
}

export function ServerInfoCard({ info }: ServerInfoCardProps) {
  const formatUptime = () => {
    const parts = []
    if (info.uptimeDays > 0) parts.push(`${info.uptimeDays}d`)
    if (info.uptimeHours > 0) parts.push(`${info.uptimeHours}h`)
    parts.push(`${info.uptimeMinutes}m`)
    return parts.join(' ')
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Server className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">{info.serverName}</h3>
          <p className="text-sm text-muted-foreground">{info.instanceName}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Version</span>
          <p className="font-medium truncate" title={info.version}>
            {info.version.split(' ').slice(0, 4).join(' ')}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Edition</span>
          <p className="font-medium">{info.edition}</p>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <span className="text-muted-foreground">Uptime</span>
            <p className="font-medium">{formatUptime()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <div>
            <span className="text-muted-foreground">CPU Cores</span>
            <p className="font-medium">{info.cpuCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <div>
            <span className="text-muted-foreground">Memory</span>
            <p className="font-medium">{(info.physicalMemoryMB / 1024).toFixed(1)} GB</p>
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Max Memory</span>
          <p className="font-medium">{(info.maxMemoryMB / 1024).toFixed(1)} GB</p>
        </div>
      </div>
    </div>
  )
}
