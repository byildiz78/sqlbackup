'use client'

import { Database, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DatabaseStatus } from '@/lib/sql-health/types'

interface DatabasesTableProps {
  databases: DatabaseStatus[]
}

export function DatabasesTable({ databases }: DatabasesTableProps) {
  const formatDate = (date: Date | null) => {
    if (!date) return '-'
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const getBackupStatus = (db: DatabaseStatus) => {
    if (!db.lastFullBackup) return 'critical'
    const hoursSince = (Date.now() - new Date(db.lastFullBackup).getTime()) / (1000 * 60 * 60)
    if (hoursSince > 48) return 'warning'
    return 'normal'
  }

  const getLogStatus = (percent: number) => {
    if (percent > 90) return 'critical'
    if (percent > 80) return 'warning'
    return 'normal'
  }

  const statusColors = {
    normal: 'text-green-500',
    warning: 'text-yellow-500',
    critical: 'text-red-500'
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <Database className="h-5 w-5" />
        Databases ({databases.length})
      </h3>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium">Database</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Recovery</th>
                <th className="text-right p-2 font-medium">Data Size</th>
                <th className="text-right p-2 font-medium">Log Size</th>
                <th className="text-right p-2 font-medium">Log %</th>
                <th className="text-center p-2 font-medium">Full</th>
                <th className="text-center p-2 font-medium">Diff</th>
                <th className="text-center p-2 font-medium">Log</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {databases.map((db) => {
                const backupStatus = getBackupStatus(db)
                const logStatus = getLogStatus(db.logUsedPercent)

                return (
                  <tr key={db.databaseId} className="hover:bg-muted/50">
                    <td className="p-2 font-medium">{db.name}</td>
                    <td className="p-2">
                      <span className={cn(
                        'inline-flex items-center gap-1',
                        db.status === 'ONLINE' ? 'text-green-500' : 'text-red-500'
                      )}>
                        {db.status === 'ONLINE' ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        {db.status}
                      </span>
                    </td>
                    <td className="p-2 text-muted-foreground">{db.recoveryModel}</td>
                    <td className="p-2 text-right font-mono">
                      {db.dataSizeMB > 1024
                        ? `${(db.dataSizeMB / 1024).toFixed(1)} GB`
                        : `${db.dataSizeMB.toFixed(0)} MB`}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {db.logSizeMB > 1024
                        ? `${(db.logSizeMB / 1024).toFixed(1)} GB`
                        : `${db.logSizeMB.toFixed(0)} MB`}
                    </td>
                    <td className="p-2 text-right">
                      <span className={cn('font-mono', statusColors[logStatus])}>
                        {db.logUsedPercent?.toFixed(0) || 0}%
                      </span>
                    </td>
                    <td className={cn('p-2 text-center', statusColors[backupStatus])}>
                      {formatDate(db.lastFullBackup)}
                    </td>
                    <td className="p-2 text-center text-muted-foreground">
                      {formatDate(db.lastDiffBackup)}
                    </td>
                    <td className="p-2 text-center text-muted-foreground">
                      {formatDate(db.lastLogBackup)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
