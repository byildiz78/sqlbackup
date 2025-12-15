import nodemailer from 'nodemailer'
import { prisma } from './db'
import { formatDate, formatDuration, getTodayString, TIMEZONE } from './date-utils'

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SUPPORT_MAIL,
    pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ''), // Remove spaces from app password
  },
})

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export interface JobResult {
  id: string
  type: 'backup' | 'maintenance'
  database: string
  server: string
  status: 'success' | 'failed' | 'running'
  startedAt: Date
  completedAt?: Date | null
  duration?: number | null
  sizeMb?: number | null
  errorMsg?: string | null
  backupType?: string
  maintenanceType?: string
}

export interface DailySummary {
  date: string
  totalJobs: number
  successCount: number
  failedCount: number
  runningCount: number
  backupJobs: JobResult[]
  maintenanceJobs: JobResult[]
  failedJobs: JobResult[]
  totalBackupSizeMb: number
  averageDuration: number
}

// Send email
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const from = process.env.SUPPORT_MAIL
    if (!from || !process.env.GMAIL_APP_PASSWORD) {
      console.error('Email configuration missing: SUPPORT_MAIL or GMAIL_APP_PASSWORD not set')
      return false
    }

    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to

    await transporter.sendMail({
      from: `"RobotPOS SQL Tool" <${from}>`,
      to: recipients,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })

    console.log(`Email sent successfully to ${recipients}`)
    return true
  } catch (error) {
    console.error('Failed to send email:', error)
    return false
  }
}

// Get support email addresses from settings or env
export async function getSupportEmails(): Promise<string[]> {
  try {
    const settings = await prisma.setting.findFirst({
      where: { key: 'notification_emails' }
    })

    if (settings?.value) {
      return settings.value.split(',').map((e: string) => e.trim()).filter(Boolean)
    }
  } catch {
    // Settings table might not exist yet
  }

  // Fallback to environment variable
  const envEmail = process.env.SUPPORT_MAIL
  return envEmail ? [envEmail] : []
}

// Get jobs from last N hours
export async function getRecentJobs(hours: number = 24): Promise<JobResult[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)

  const results: JobResult[] = []

  // Get backup history
  const backupHistory = await prisma.backupHistory.findMany({
    where: {
      startedAt: { gte: since }
    },
    include: {
      job: true,
      database: {
        include: { server: true }
      }
    },
    orderBy: { startedAt: 'desc' }
  })

  for (const h of backupHistory) {
    results.push({
      id: h.id,
      type: 'backup',
      database: h.database.name,
      server: h.database.server.name,
      status: h.status as 'success' | 'failed' | 'running',
      startedAt: h.startedAt,
      completedAt: h.completedAt,
      duration: h.duration,
      sizeMb: h.sizeMb,
      errorMsg: h.errorMsg,
      backupType: h.backupType,
    })
  }

  // Get maintenance history
  const maintenanceHistory = await prisma.maintenanceHistory.findMany({
    where: {
      startedAt: { gte: since }
    },
    include: {
      job: true,
      database: {
        include: { server: true }
      }
    },
    orderBy: { startedAt: 'desc' }
  })

  for (const h of maintenanceHistory) {
    results.push({
      id: h.id,
      type: 'maintenance',
      database: h.database.name,
      server: h.database.server.name,
      status: h.status as 'success' | 'failed' | 'running',
      startedAt: h.startedAt,
      completedAt: h.completedAt,
      duration: h.duration,
      errorMsg: h.errorMsg,
      maintenanceType: h.maintenanceType,
    })
  }

  return results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
}

// Get jobs from today (start of day to now)
export async function getTodayJobs(): Promise<JobResult[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const results: JobResult[] = []

  // Get backup history
  const backupHistory = await prisma.backupHistory.findMany({
    where: {
      startedAt: { gte: today }
    },
    include: {
      job: true,
      database: {
        include: { server: true }
      }
    },
    orderBy: { startedAt: 'desc' }
  })

  for (const h of backupHistory) {
    results.push({
      id: h.id,
      type: 'backup',
      database: h.database.name,
      server: h.database.server.name,
      status: h.status as 'success' | 'failed' | 'running',
      startedAt: h.startedAt,
      completedAt: h.completedAt,
      duration: h.duration,
      sizeMb: h.sizeMb,
      errorMsg: h.errorMsg,
      backupType: h.backupType,
    })
  }

  // Get maintenance history
  const maintenanceHistory = await prisma.maintenanceHistory.findMany({
    where: {
      startedAt: { gte: today }
    },
    include: {
      job: true,
      database: {
        include: { server: true }
      }
    },
    orderBy: { startedAt: 'desc' }
  })

  for (const h of maintenanceHistory) {
    results.push({
      id: h.id,
      type: 'maintenance',
      database: h.database.name,
      server: h.database.server.name,
      status: h.status as 'success' | 'failed' | 'running',
      startedAt: h.startedAt,
      completedAt: h.completedAt,
      duration: h.duration,
      errorMsg: h.errorMsg,
      maintenanceType: h.maintenanceType,
    })
  }

  return results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
}

// Generate daily summary
export async function generateDailySummary(): Promise<DailySummary> {
  const jobs = await getTodayJobs()

  const backupJobs = jobs.filter(j => j.type === 'backup')
  const maintenanceJobs = jobs.filter(j => j.type === 'maintenance')
  const failedJobs = jobs.filter(j => j.status === 'failed')

  const successCount = jobs.filter(j => j.status === 'success').length
  const failedCount = failedJobs.length
  const runningCount = jobs.filter(j => j.status === 'running').length

  const completedJobs = jobs.filter(j => j.duration !== null && j.duration !== undefined)
  const averageDuration = completedJobs.length > 0
    ? Math.round(completedJobs.reduce((sum, j) => sum + (j.duration || 0), 0) / completedJobs.length)
    : 0

  const totalBackupSizeMb = backupJobs
    .filter(j => j.status === 'success' && j.sizeMb)
    .reduce((sum, j) => sum + (j.sizeMb || 0), 0)

  return {
    date: getTodayString(),
    totalJobs: jobs.length,
    successCount,
    failedCount,
    runningCount,
    backupJobs,
    maintenanceJobs,
    failedJobs,
    totalBackupSizeMb,
    averageDuration,
  }
}

// HTML template for daily summary email
export function generateDailySummaryHtml(summary: DailySummary): string {
  const statusColor = summary.failedCount > 0 ? '#ef4444' : '#22c55e'
  const statusText = summary.failedCount > 0
    ? `${summary.failedCount} Failed Job${summary.failedCount > 1 ? 's' : ''}`
    : 'All Jobs Successful'

  let failedJobsHtml = ''
  if (summary.failedJobs.length > 0) {
    failedJobsHtml = `
      <div style="margin-top: 24px; padding: 16px; background-color: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
        <h3 style="margin: 0 0 12px 0; color: #dc2626; font-size: 16px;">Failed Jobs</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #fee2e2;">
              <th style="padding: 8px; text-align: left; font-size: 12px;">Type</th>
              <th style="padding: 8px; text-align: left; font-size: 12px;">Database</th>
              <th style="padding: 8px; text-align: left; font-size: 12px;">Server</th>
              <th style="padding: 8px; text-align: left; font-size: 12px;">Time</th>
              <th style="padding: 8px; text-align: left; font-size: 12px;">Error</th>
            </tr>
          </thead>
          <tbody>
            ${summary.failedJobs.map(job => `
              <tr style="border-bottom: 1px solid #fecaca;">
                <td style="padding: 8px; font-size: 12px;">
                  <span style="display: inline-block; padding: 2px 8px; background-color: ${job.type === 'backup' ? '#fed7aa' : '#a5f3fc'}; border-radius: 4px; font-size: 11px;">
                    ${job.type === 'backup' ? (job.backupType || 'FULL') : (job.maintenanceType || 'INDEX')}
                  </span>
                </td>
                <td style="padding: 8px; font-size: 12px; font-weight: 500;">${job.database}</td>
                <td style="padding: 8px; font-size: 12px; color: #666;">${job.server}</td>
                <td style="padding: 8px; font-size: 12px;">${formatDate(job.startedAt)}</td>
                <td style="padding: 8px; font-size: 11px; color: #dc2626; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">
                  ${job.errorMsg || 'Unknown error'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  let backupSummaryHtml = ''
  if (summary.backupJobs.length > 0) {
    const successfulBackups = summary.backupJobs.filter(j => j.status === 'success')
    backupSummaryHtml = `
      <div style="margin-top: 24px;">
        <h3 style="margin: 0 0 12px 0; color: #333; font-size: 16px;">Backup Summary</h3>
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 150px; padding: 12px; background-color: #f0fdf4; border-radius: 8px;">
            <p style="margin: 0; font-size: 24px; font-weight: bold; color: #16a34a;">${successfulBackups.length}</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">Successful Backups</p>
          </div>
          <div style="flex: 1; min-width: 150px; padding: 12px; background-color: #fff7ed; border-radius: 8px;">
            <p style="margin: 0; font-size: 24px; font-weight: bold; color: #ea580c;">${summary.totalBackupSizeMb.toFixed(1)} MB</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">Total Backup Size</p>
          </div>
        </div>
      </div>
    `
  }

  let maintenanceSummaryHtml = ''
  if (summary.maintenanceJobs.length > 0) {
    const successfulMaintenance = summary.maintenanceJobs.filter(j => j.status === 'success')
    maintenanceSummaryHtml = `
      <div style="margin-top: 24px;">
        <h3 style="margin: 0 0 12px 0; color: #333; font-size: 16px;">Maintenance Summary</h3>
        <div style="padding: 12px; background-color: #ecfeff; border-radius: 8px;">
          <p style="margin: 0; font-size: 24px; font-weight: bold; color: #0891b2;">${successfulMaintenance.length}</p>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">Successful Maintenance Jobs</p>
        </div>
      </div>
    `
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Daily Job Summary</h1>
            <p style="margin: 8px 0 0 0; color: #bfdbfe; font-size: 14px;">${summary.date}</p>
          </div>

          <!-- Status Banner -->
          <div style="padding: 16px; background-color: ${statusColor}15; border-bottom: 1px solid ${statusColor}30; text-align: center;">
            <span style="display: inline-block; padding: 8px 16px; background-color: ${statusColor}; color: white; border-radius: 20px; font-size: 14px; font-weight: 500;">
              ${statusText}
            </span>
          </div>

          <!-- Content -->
          <div style="padding: 24px;">
            <!-- Overview Stats -->
            <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
              <div style="flex: 1; min-width: 100px; padding: 16px; background-color: #f8fafc; border-radius: 8px; text-align: center;">
                <p style="margin: 0; font-size: 28px; font-weight: bold; color: #3b82f6;">${summary.totalJobs}</p>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Total Jobs</p>
              </div>
              <div style="flex: 1; min-width: 100px; padding: 16px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
                <p style="margin: 0; font-size: 28px; font-weight: bold; color: #22c55e;">${summary.successCount}</p>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Success</p>
              </div>
              <div style="flex: 1; min-width: 100px; padding: 16px; background-color: #fef2f2; border-radius: 8px; text-align: center;">
                <p style="margin: 0; font-size: 28px; font-weight: bold; color: #ef4444;">${summary.failedCount}</p>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Failed</p>
              </div>
            </div>

            <!-- Average Duration -->
            <div style="padding: 12px 16px; background-color: #f8fafc; border-radius: 8px; margin-bottom: 16px;">
              <span style="font-size: 13px; color: #64748b;">Average Duration:</span>
              <span style="font-size: 13px; font-weight: 600; color: #334155; margin-left: 8px;">${formatDuration(summary.averageDuration)}</span>
            </div>

            ${failedJobsHtml}
            ${backupSummaryHtml}
            ${maintenanceSummaryHtml}
          </div>

          <!-- Footer -->
          <div style="padding: 16px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
              RobotPOS SQL Tool - Automated Database Management
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}

// HTML template for job failure alert
export function generateJobFailureHtml(job: JobResult): string {
  const jobTypeLabel = job.type === 'backup'
    ? `Backup (${job.backupType || 'FULL'})`
    : `Maintenance (${job.maintenanceType || 'INDEX'})`

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Job Failed Alert</h1>
            <p style="margin: 8px 0 0 0; color: #fecaca; font-size: 14px;">Immediate attention required</p>
          </div>

          <!-- Content -->
          <div style="padding: 24px;">
            <!-- Job Info -->
            <div style="margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; width: 120px;">Job Type</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 500;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${job.type === 'backup' ? '#fed7aa' : '#a5f3fc'}; border-radius: 4px;">
                      ${jobTypeLabel}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Database</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; color: #1e40af;">${job.database}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Server</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${job.server}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Started At</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${formatDate(job.startedAt)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Duration</td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px;">${formatDuration(job.duration)}</td>
                </tr>
              </table>
            </div>

            <!-- Error Message -->
            <div style="padding: 16px; background-color: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
              <h3 style="margin: 0 0 8px 0; color: #dc2626; font-size: 14px;">Error Message</h3>
              <pre style="margin: 0; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; color: #7f1d1d; white-space: pre-wrap; word-break: break-word;">
${job.errorMsg || 'No error message available'}
              </pre>
            </div>
          </div>

          <!-- Footer -->
          <div style="padding: 16px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
              RobotPOS SQL Tool - Automated Database Management
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}

// Send daily summary email
export async function sendDailySummaryEmail(): Promise<boolean> {
  try {
    const emails = await getSupportEmails()
    if (emails.length === 0) {
      console.log('No email recipients configured for daily summary')
      return false
    }

    const summary = await generateDailySummary()

    if (summary.totalJobs === 0) {
      console.log('No jobs to report in daily summary')
      return false
    }

    const html = generateDailySummaryHtml(summary)
    const statusText = summary.failedCount > 0
      ? `${summary.failedCount} Failed`
      : 'All Successful'

    return await sendEmail({
      to: emails,
      subject: `[RobotPOS] Daily Summary - ${summary.date} - ${statusText}`,
      html,
    })
  } catch (error) {
    console.error('Failed to send daily summary email:', error)
    return false
  }
}

// Send job failure alert
export async function sendJobFailureAlert(job: JobResult): Promise<boolean> {
  try {
    const emails = await getSupportEmails()
    if (emails.length === 0) {
      console.log('No email recipients configured for failure alerts')
      return false
    }

    const html = generateJobFailureHtml(job)
    const jobType = job.type === 'backup' ? 'Backup' : 'Maintenance'

    return await sendEmail({
      to: emails,
      subject: `[RobotPOS] ALERT: ${jobType} Failed - ${job.database} @ ${job.server}`,
      html,
    })
  } catch (error) {
    console.error('Failed to send job failure alert:', error)
    return false
  }
}

// Test email connection
export async function testEmailConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    await transporter.verify()
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
