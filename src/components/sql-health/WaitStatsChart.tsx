'use client'

import { cn } from '@/lib/utils'
import type { WaitStatistic } from '@/lib/sql-health/types'

interface WaitStatsChartProps {
  waitStats: WaitStatistic[]
}

const categoryColors: Record<string, string> = {
  'I/O': 'bg-blue-500',
  'Lock': 'bg-red-500',
  'Memory': 'bg-purple-500',
  'Network': 'bg-green-500',
  'CPU': 'bg-orange-500',
  'Parallelism': 'bg-cyan-500',
  'Other': 'bg-gray-500'
}

export function WaitStatsChart({ waitStats }: WaitStatsChartProps) {
  if (waitStats.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No significant wait statistics
      </div>
    )
  }

  const topStats = waitStats.slice(0, 10)

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Wait Statistics</h3>

      <div className="space-y-2">
        {topStats.map((stat, index) => (
          <div key={stat.waitType} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={cn('w-3 h-3 rounded', categoryColors[stat.category] || 'bg-gray-500')} />
                <span className="font-mono text-xs truncate max-w-48" title={stat.waitType}>
                  {stat.waitType}
                </span>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="text-xs">{stat.category}</span>
                <span className="font-mono">{stat.percentTotal.toFixed(1)}%</span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full', categoryColors[stat.category] || 'bg-gray-500')}
                style={{ width: `${stat.percentTotal}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 pt-2 border-t">
        {Object.entries(categoryColors).map(([category, color]) => (
          <div key={category} className="flex items-center gap-1 text-xs text-muted-foreground">
            <div className={cn('w-2 h-2 rounded', color)} />
            {category}
          </div>
        ))}
      </div>
    </div>
  )
}
