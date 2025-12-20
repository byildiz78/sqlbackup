'use client'

import type { MemoryBreakdown } from '@/lib/sql-health/types'

interface MemoryChartProps {
  memory: MemoryBreakdown
}

export function MemoryChart({ memory }: MemoryChartProps) {
  if (!memory) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold">Memory Usage</h3>
        <div className="text-sm text-muted-foreground">No data available</div>
      </div>
    )
  }

  const segments = [
    { label: 'Buffer Pool', value: Number(memory?.bufferPoolMB) || 0, color: 'bg-blue-500' },
    { label: 'Plan Cache', value: Number(memory?.planCacheMB) || 0, color: 'bg-purple-500' },
    { label: 'Stolen', value: Number(memory?.stolenMemoryMB) || 0, color: 'bg-orange-500' },
    { label: 'Free', value: Number(memory?.freeMemoryMB) || 0, color: 'bg-gray-300' }
  ]

  const total = Number(memory?.totalServerMemoryMB) || 1

  const formatMB = (mb: number | null | undefined) => {
    const value = Number(mb) || 0
    if (value > 1024) return `${(value / 1024).toFixed(1)} GB`
    return `${value.toFixed(0)} MB`
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Memory Usage</h3>
        <span className="text-sm text-muted-foreground">
          {formatMB(memory?.totalServerMemoryMB)} / {formatMB(memory?.targetServerMemoryMB)}
        </span>
      </div>

      {/* Stacked bar */}
      <div className="h-6 rounded-full bg-muted overflow-hidden flex">
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            className={`${seg.color} transition-all`}
            style={{ width: `${(seg.value / total) * 100}%` }}
            title={`${seg.label}: ${formatMB(seg.value)}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded ${seg.color}`} />
              <span className="text-muted-foreground">{seg.label}</span>
            </div>
            <span className="font-mono">{formatMB(seg.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
