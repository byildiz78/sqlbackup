import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  testEmailConnection,
  sendDailySummaryEmail,
  generateDailySummary,
  getSupportEmails
} from '@/lib/notifications'
import { scheduleDailySummary } from '@/lib/scheduler'

// GET: Get notification settings and test connection
export async function GET() {
  try {
    const emails = await getSupportEmails()
    const connectionTest = await testEmailConnection()
    const summary = await generateDailySummary()

    // Get notification settings
    let settings = {
      dailySummaryEnabled: true,
      failureAlertsEnabled: true,
      summaryTime: '08:00',
    }

    try {
      const dbSettings = await prisma.setting.findMany({
        where: {
          key: {
            in: ['daily_summary_enabled', 'failure_alerts_enabled', 'summary_time', 'notification_emails']
          }
        }
      })

      for (const s of dbSettings) {
        if (s.key === 'daily_summary_enabled') settings.dailySummaryEnabled = s.value === 'true'
        if (s.key === 'failure_alerts_enabled') settings.failureAlertsEnabled = s.value === 'true'
        if (s.key === 'summary_time') settings.summaryTime = s.value
      }
    } catch {
      // Settings table might not exist
    }

    return NextResponse.json({
      emails,
      settings,
      connection: connectionTest,
      lastDaySummary: {
        totalJobs: summary.totalJobs,
        successCount: summary.successCount,
        failedCount: summary.failedCount,
        totalBackupSizeMb: summary.totalBackupSizeMb,
      }
    })
  } catch (error) {
    console.error('Failed to get notification settings:', error)
    return NextResponse.json(
      { error: 'Failed to get notification settings' },
      { status: 500 }
    )
  }
}

// POST: Update notification settings
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { emails, dailySummaryEnabled, failureAlertsEnabled, summaryTime } = body

    // Update settings in database
    const settingsToUpdate = [
      { key: 'notification_emails', value: Array.isArray(emails) ? emails.join(',') : emails || '' },
      { key: 'daily_summary_enabled', value: String(dailySummaryEnabled ?? true) },
      { key: 'failure_alerts_enabled', value: String(failureAlertsEnabled ?? true) },
      { key: 'summary_time', value: summaryTime || '08:00' },
    ]

    for (const s of settingsToUpdate) {
      await prisma.setting.upsert({
        where: { key: s.key },
        update: { value: s.value },
        create: { key: s.key, value: s.value },
      })
    }

    // Reschedule daily summary with new settings
    await scheduleDailySummary()
    console.log('[Notifications API] Daily summary rescheduled with new settings')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update notification settings:', error)
    return NextResponse.json(
      { error: 'Failed to update notification settings' },
      { status: 500 }
    )
  }
}
