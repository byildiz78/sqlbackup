import { NextResponse } from 'next/server'
import { sendDailySummaryEmail, generateDailySummary } from '@/lib/notifications'

// POST: Manually send daily summary email
export async function POST() {
  try {
    // Generate summary for today
    const summary = await generateDailySummary()

    if (summary.totalJobs === 0) {
      return NextResponse.json({
        success: false,
        message: 'No jobs found in the specified time period',
        summary
      })
    }

    // Send the email
    const sent = await sendDailySummaryEmail()

    return NextResponse.json({
      success: sent,
      message: sent ? 'Daily summary email sent successfully' : 'Failed to send email',
      summary: {
        totalJobs: summary.totalJobs,
        successCount: summary.successCount,
        failedCount: summary.failedCount,
        backupJobs: summary.backupJobs.length,
        maintenanceJobs: summary.maintenanceJobs.length,
        totalBackupSizeMb: summary.totalBackupSizeMb,
      }
    })
  } catch (error) {
    console.error('Send summary failed:', error)
    return NextResponse.json(
      { error: 'Failed to send summary email' },
      { status: 500 }
    )
  }
}
