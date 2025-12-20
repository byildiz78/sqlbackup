'use client'

import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  status?: 'normal' | 'warning' | 'critical'
  progress?: number
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  status = 'normal',
  progress
}: MetricCardProps) {
  const statusColors = {
    normal: 'border-border',
    warning: 'border-yellow-500 bg-yellow-500/5',
    critical: 'border-red-500 bg-red-500/5'
  }

  const progressColors = {
    normal: 'bg-primary',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500'
  }

  return (
    <div className={cn(
      'rounded-lg border p-4 transition-colors',
      statusColors[status]
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && (
        <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
      )}
      {progress !== undefined && (
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', progressColors[status])}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
    </div>
  )
}
