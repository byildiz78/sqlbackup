import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getScheduledJobs } from "@/lib/scheduler"
import CronExpressionParser from "cron-parser"

function getNextRunTime(cronExpression: string): string | null {
  try {
    const expression = CronExpressionParser.parse(cronExpression)
    return expression.next().toDate().toISOString()
  } catch (error) {
    console.error(`Failed to parse cron: ${cronExpression}`, error)
    return null
  }
}

function getCronDescription(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length !== 5) return cron

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  // Common patterns
  if (cron === '0 0 * * *') return 'Daily at midnight'
  if (cron === '0 2 * * *') return 'Daily at 02:00'
  if (cron === '0 * * * *') return 'Every hour'
  if (cron === '*/5 * * * *') return 'Every 5 minutes'
  if (cron === '*/15 * * * *') return 'Every 15 minutes'
  if (cron === '*/30 * * * *') return 'Every 30 minutes'
  if (cron === '0 */6 * * *') return 'Every 6 hours'
  if (cron === '0 */12 * * *') return 'Every 12 hours'
  if (cron === '0 0 * * 0') return 'Weekly on Sunday'
  if (cron === '0 0 * * 1') return 'Weekly on Monday'
  if (cron === '0 0 1 * *') return 'Monthly on 1st'

  // Generic description
  if (minute === '0' && hour !== '*') return `Daily at ${hour.padStart(2, '0')}:00`
  if (minute !== '*' && hour === '*') return `Every hour at :${minute.padStart(2, '0')}`

  return cron
}

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const scheduledJobIds = getScheduledJobs()

  // Get backup jobs with details
  const backupJobs = await prisma.backupJob.findMany({
    include: {
      database: {
        include: { server: true }
      },
      history: {
        take: 5,
        orderBy: { startedAt: 'desc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Get maintenance jobs with details
  const maintenanceJobs = await prisma.maintenanceJob.findMany({
    include: {
      database: {
        include: { server: true }
      },
      history: {
        take: 5,
        orderBy: { startedAt: 'desc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Format backup jobs
  const formattedBackupJobs = backupJobs.map(job => ({
    id: job.id,
    type: 'backup' as const,
    name: `${job.database.name} - ${job.backupType}`,
    database: job.database.name,
    server: job.database.server.name,
    backupType: job.backupType,
    scheduleCron: job.scheduleCron,
    scheduleDescription: getCronDescription(job.scheduleCron),
    nextRun: getNextRunTime(job.scheduleCron),
    isEnabled: job.isEnabled,
    isScheduled: scheduledJobIds.includes(job.id),
    storageTarget: job.storageTarget,
    compression: job.compression,
    checksum: job.checksum,
    retentionDays: job.retentionDays,
    lastRun: job.history[0]?.startedAt ?? null,
    lastCompleted: job.history[0]?.completedAt ?? null,
    lastDuration: job.history[0]?.duration ?? null,
    lastStatus: job.history[0]?.status ?? null,
    lastError: job.history[0]?.errorMsg ?? null,
    lastSizeMb: job.history[0]?.sizeMb ?? null,
    history: job.history.map(h => ({
      startedAt: h.startedAt,
      completedAt: h.completedAt,
      duration: h.duration,
      status: h.status,
      sizeMb: h.sizeMb,
      errorMsg: h.errorMsg
    })),
    createdAt: job.createdAt
  }))

  // Format maintenance jobs
  const formattedMaintenanceJobs = maintenanceJobs.map(job => ({
    id: job.id,
    type: 'maintenance' as const,
    name: `${job.database.name} - ${job.maintenanceType}`,
    database: job.database.name,
    server: job.database.server.name,
    maintenanceType: job.maintenanceType,
    scheduleCron: job.scheduleCron,
    scheduleDescription: getCronDescription(job.scheduleCron),
    nextRun: getNextRunTime(job.scheduleCron),
    isEnabled: job.isEnabled,
    isScheduled: scheduledJobIds.includes(job.id),
    lastRun: job.history[0]?.startedAt ?? null,
    lastCompleted: job.history[0]?.completedAt ?? null,
    lastDuration: job.history[0]?.duration ?? null,
    lastStatus: job.history[0]?.status ?? null,
    lastError: job.history[0]?.errorMsg ?? null,
    history: job.history.map(h => ({
      startedAt: h.startedAt,
      completedAt: h.completedAt,
      duration: h.duration,
      status: h.status,
      errorMsg: h.errorMsg
    })),
    createdAt: job.createdAt
  }))

  // Combine and sort by next run time
  const allJobs = [...formattedBackupJobs, ...formattedMaintenanceJobs]
    .sort((a, b) => {
      if (!a.nextRun) return 1
      if (!b.nextRun) return -1
      return new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime()
    })

  return NextResponse.json({
    jobs: allJobs,
    summary: {
      totalJobs: allJobs.length,
      activeJobs: allJobs.filter(j => j.isEnabled).length,
      scheduledJobs: allJobs.filter(j => j.isScheduled).length,
      backupJobs: formattedBackupJobs.length,
      maintenanceJobs: formattedMaintenanceJobs.length
    }
  })
}
