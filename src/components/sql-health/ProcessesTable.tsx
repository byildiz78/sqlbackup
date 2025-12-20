'use client'

import { useState } from 'react'
import { Skull, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActiveProcess } from '@/lib/sql-health/types'

interface ProcessesTableProps {
  processes: ActiveProcess[]
  onKillProcess: (spid: number) => void
}

export function ProcessesTable({ processes, onKillProcess }: ProcessesTableProps) {
  const [hideSleeping, setHideSleeping] = useState(true)
  const [hideSystem, setHideSystem] = useState(true)
  const [expandedSpid, setExpandedSpid] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'cpu' | 'duration' | 'reads'>('cpu')

  const filteredProcesses = processes.filter(p => {
    if (hideSleeping && p.status === 'sleeping') return false
    if (hideSystem && p.isSystem) return false
    return true
  })

  const sortedProcesses = [...filteredProcesses].sort((a, b) => {
    if (sortBy === 'cpu') return b.cpuTime - a.cpuTime
    if (sortBy === 'duration') return b.elapsedTimeMs - a.elapsedTimeMs
    return b.logicalReads - a.logicalReads
  })

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    const sec = Math.floor(ms / 1000)
    if (sec < 60) return `${sec}s`
    const min = Math.floor(sec / 60)
    const remSec = sec % 60
    if (min < 60) return `${min}m ${remSec}s`
    const hr = Math.floor(min / 60)
    const remMin = min % 60
    return `${hr}h ${remMin}m`
  }

  const getStatusColor = (status: string, blockingSpid: number | null) => {
    if (blockingSpid) return 'text-red-500'
    if (status === 'running') return 'text-green-500'
    if (status === 'suspended') return 'text-yellow-500'
    return 'text-muted-foreground'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          Active Processes ({filteredProcesses.length})
        </h3>
        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={() => setHideSleeping(!hideSleeping)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {hideSleeping ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            Sleeping
          </button>
          <button
            onClick={() => setHideSystem(!hideSystem)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {hideSystem ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            System
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'cpu' | 'duration' | 'reads')}
            className="bg-background border rounded px-2 py-1"
          >
            <option value="cpu">Sort by CPU</option>
            <option value="duration">Sort by Duration</option>
            <option value="reads">Sort by Reads</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium">SPID</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Login</th>
                <th className="text-left p-2 font-medium">Database</th>
                <th className="text-left p-2 font-medium">Command</th>
                <th className="text-right p-2 font-medium">CPU</th>
                <th className="text-right p-2 font-medium">Reads</th>
                <th className="text-right p-2 font-medium">Duration</th>
                <th className="text-left p-2 font-medium">Wait</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedProcesses.slice(0, 50).map((p) => (
                <>
                  <tr
                    key={p.spid}
                    className={cn(
                      'hover:bg-muted/50 cursor-pointer',
                      p.blockingSpid && 'bg-red-500/10'
                    )}
                    onClick={() => setExpandedSpid(expandedSpid === p.spid ? null : p.spid)}
                  >
                    <td className="p-2 font-mono">
                      {p.spid}
                      {p.blockingSpid && (
                        <span className="text-red-500 text-xs ml-1">
                          (blocked by {p.blockingSpid})
                        </span>
                      )}
                    </td>
                    <td className={cn('p-2', getStatusColor(p.status, p.blockingSpid))}>
                      {p.status}
                    </td>
                    <td className="p-2 truncate max-w-24" title={p.loginName}>
                      {p.loginName}
                    </td>
                    <td className="p-2">{p.databaseName}</td>
                    <td className="p-2">{p.command}</td>
                    <td className="p-2 text-right font-mono">{p.cpuTime.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono">{p.logicalReads.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono">{formatDuration(p.elapsedTimeMs)}</td>
                    <td className="p-2 text-muted-foreground truncate max-w-24" title={p.waitType || ''}>
                      {p.waitType || '-'}
                    </td>
                    <td className="p-2">
                      {!p.isSystem && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Kill process ${p.spid}?`)) {
                              onKillProcess(p.spid)
                            }
                          }}
                          className="p-1 hover:bg-red-500/20 rounded text-red-500"
                          title="Kill Process"
                        >
                          <Skull className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedSpid === p.spid && p.queryText && (
                    <tr key={`${p.spid}-query`}>
                      <td colSpan={10} className="p-2 bg-muted/30">
                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                          {p.queryText}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
