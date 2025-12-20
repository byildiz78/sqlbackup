'use client'

import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Alert } from '@/lib/sql-health/types'

interface AlertsPanelProps {
  alerts: Alert[]
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border bg-green-500/10 border-green-500/30 p-4">
        <div className="flex items-center gap-2 text-green-600">
          <Info className="h-5 w-5" />
          <span className="font-medium">All systems healthy</span>
        </div>
      </div>
    )
  }

  const severityConfig = {
    critical: {
      bg: 'bg-red-500/10 border-red-500/30',
      icon: <AlertCircle className="h-4 w-4 text-red-500" />,
      text: 'text-red-600'
    },
    warning: {
      bg: 'bg-yellow-500/10 border-yellow-500/30',
      icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
      text: 'text-yellow-600'
    },
    info: {
      bg: 'bg-blue-500/10 border-blue-500/30',
      icon: <Info className="h-4 w-4 text-blue-500" />,
      text: 'text-blue-600'
    }
  }

  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const warningCount = alerts.filter(a => a.severity === 'warning').length

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 mb-3">
        <h3 className="font-semibold">Alerts</h3>
        {criticalCount > 0 && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-red-500 text-white">
            {criticalCount} critical
          </span>
        )}
        {warningCount > 0 && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500 text-white">
            {warningCount} warning
          </span>
        )}
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {alerts.map((alert, index) => {
          const config = severityConfig[alert.severity]
          return (
            <div
              key={index}
              className={cn('rounded-lg border p-3 flex items-start gap-3', config.bg)}
            >
              {config.icon}
              <div className="flex-1 min-w-0">
                <div className={cn('font-medium text-sm', config.text)}>
                  [{alert.category}] {alert.message}
                </div>
                {alert.details && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {alert.details}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
