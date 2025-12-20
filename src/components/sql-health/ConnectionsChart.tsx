'use client'

import { Users } from 'lucide-react'
import type { ConnectionSummary } from '@/lib/sql-health/types'

interface ConnectionsChartProps {
  connections: ConnectionSummary
}

export function ConnectionsChart({ connections }: ConnectionsChartProps) {
  if (!connections) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h3 className="font-semibold">Connections</h3>
        </div>
        <div className="text-sm text-muted-foreground">No data available</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5" />
        <h3 className="font-semibold">Connections</h3>
        <span className="text-muted-foreground">({connections.totalConnections || 0})</span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold text-green-500">
            {connections.activeQueries || 0}
          </div>
          <div className="text-xs text-muted-foreground">Active</div>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold text-yellow-500">
            {connections.sleepingConnections || 0}
          </div>
          <div className="text-xs text-muted-foreground">Sleeping</div>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">
            {connections.totalConnections || 0}
          </div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        {/* By Application */}
        <div>
          <h4 className="font-medium mb-2 text-muted-foreground">By Application</h4>
          <div className="space-y-1">
            {(connections.byApplication || []).slice(0, 5).map((item) => (
              <div key={item.name} className="flex justify-between">
                <span className="truncate max-w-20" title={item.name}>
                  {item.name}
                </span>
                <span className="font-mono">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Login */}
        <div>
          <h4 className="font-medium mb-2 text-muted-foreground">By Login</h4>
          <div className="space-y-1">
            {(connections.byLogin || []).slice(0, 5).map((item) => (
              <div key={item.name} className="flex justify-between">
                <span className="truncate max-w-20" title={item.name}>
                  {item.name}
                </span>
                <span className="font-mono">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Database */}
        <div>
          <h4 className="font-medium mb-2 text-muted-foreground">By Database</h4>
          <div className="space-y-1">
            {(connections.byDatabase || []).slice(0, 5).map((item) => (
              <div key={item.name} className="flex justify-between">
                <span className="truncate max-w-20" title={item.name}>
                  {item.name}
                </span>
                <span className="font-mono">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
