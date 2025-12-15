import cron from "node-cron"
import { prisma } from "./db"
import { createConnectionFromServer, executeBackup, executeOlaBackup, checkOlaHallengrenInstalled, getDefaultBackupPath, getSqlServerEdition } from "./mssql"
import { sendDailySummaryEmail, sendJobFailureAlert, JobResult } from "./notifications"
import { syncBackupFolder, checkBorgInstalled, checkSshpassInstalled } from "./borg-backup"
import { getCleanupSettings, executeCleanup } from "./disk-cleanup"

// Timezone for all scheduled jobs (Turkey - GMT+3)
const TIMEZONE = "Europe/Istanbul"

// Sync mode types
type SyncMode = "scheduled" | "after_backups" | "manual"

interface ScheduledJob {
  jobId: string
  task: cron.ScheduledTask
}

const scheduledJobs: Map<string, ScheduledJob> = new Map()
let dailySummaryTask: cron.ScheduledTask | null = null
let borgSyncTask: cron.ScheduledTask | null = null
let cleanupTask: cron.ScheduledTask | null = null
let pendingSyncTimeout: NodeJS.Timeout | null = null
let syncTriggeredToday = false
let midnightResetTask: cron.ScheduledTask | null = null

// Get sync settings from database
async function getSyncSettings(): Promise<{
  mode: SyncMode
  enabled: boolean
  syncTime: string
  bufferMinutes: number
  backupPath: string
}> {
  const defaults = {
    mode: "after_backups" as SyncMode,
    enabled: true,
    syncTime: "06:00",
    bufferMinutes: 30,
    backupPath: "/var/opt/mssql/backup"
  }

  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: [
            "borg_sync_mode",
            "borg_sync_enabled",
            "borg_sync_time",
            "borg_sync_buffer_minutes",
            "default_backup_path"
          ]
        }
      }
    })

    const settingsMap: Record<string, string> = {}
    for (const s of settings) {
      settingsMap[s.key] = s.value
    }

    return {
      mode: (settingsMap["borg_sync_mode"] as SyncMode) || defaults.mode,
      enabled: settingsMap["borg_sync_enabled"] !== "false",
      syncTime: settingsMap["borg_sync_time"] || defaults.syncTime,
      bufferMinutes: parseInt(settingsMap["borg_sync_buffer_minutes"] || "30", 10),
      backupPath: settingsMap["default_backup_path"] || defaults.backupPath
    }
  } catch {
    return defaults
  }
}

// Check if all scheduled backup jobs for today have completed
async function checkAllDailyBackupsComplete(): Promise<{
  allComplete: boolean
  totalJobs: number
  completedJobs: number
  pendingJobs: string[]
}> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Get all enabled backup jobs
  const enabledJobs = await prisma.backupJob.findMany({
    where: { isEnabled: true },
    include: {
      database: true
    }
  })

  if (enabledJobs.length === 0) {
    return { allComplete: true, totalJobs: 0, completedJobs: 0, pendingJobs: [] }
  }

  // Get jobs that should have run today based on their cron schedule
  // For simplicity, we check which jobs have executed today
  const todayHistories = await prisma.backupHistory.findMany({
    where: {
      startedAt: {
        gte: today,
        lt: tomorrow
      },
      status: {
        in: ["success", "failed"] // Completed (either success or failed)
      }
    },
    select: {
      jobId: true
    }
  })

  const completedJobIds = new Set(todayHistories.map(h => h.jobId))

  // Check which enabled jobs have not run today
  const pendingJobs: string[] = []
  for (const job of enabledJobs) {
    // Check if this job should run today based on cron
    // For now, we'll assume daily jobs and check if they've run
    if (!completedJobIds.has(job.id)) {
      // Check if any job is currently running
      const runningJob = await prisma.backupHistory.findFirst({
        where: {
          jobId: job.id,
          status: "running"
        }
      })

      if (runningJob) {
        pendingJobs.push(`${job.database.name} (running)`)
      } else {
        // Check if job's scheduled time has passed today
        const cronParts = job.scheduleCron.split(" ")
        if (cronParts.length >= 2) {
          const cronMinute = parseInt(cronParts[0], 10)
          const cronHour = parseInt(cronParts[1], 10)
          const now = new Date()

          // Job hasn't run but its time has passed - add to pending
          if (now.getHours() > cronHour || (now.getHours() === cronHour && now.getMinutes() >= cronMinute)) {
            // Job should have run but hasn't - might be disabled or failed to start
            pendingJobs.push(`${job.database.name} (not started)`)
          } else {
            // Job is scheduled for later today
            pendingJobs.push(`${job.database.name} (scheduled for ${String(cronHour).padStart(2, '0')}:${String(cronMinute).padStart(2, '0')})`)
          }
        }
      }
    }
  }

  return {
    allComplete: pendingJobs.length === 0,
    totalJobs: enabledJobs.length,
    completedJobs: completedJobIds.size,
    pendingJobs
  }
}

// Trigger sync after buffer period
async function triggerSyncAfterBuffer() {
  const settings = await getSyncSettings()

  if (!settings.enabled || settings.mode !== "after_backups") {
    return
  }

  if (syncTriggeredToday) {
    console.log("[Scheduler] Sync already triggered today, skipping")
    return
  }

  // Clear any pending timeout
  if (pendingSyncTimeout) {
    clearTimeout(pendingSyncTimeout)
    pendingSyncTimeout = null
  }

  console.log(`[Scheduler] All backups complete. Waiting ${settings.bufferMinutes} minutes before sync...`)

  pendingSyncTimeout = setTimeout(async () => {
    if (syncTriggeredToday) {
      console.log("[Scheduler] Sync already triggered, skipping")
      return
    }

    console.log("[Scheduler] Buffer period complete. Starting borg sync...")
    syncTriggeredToday = true

    try {
      const result = await syncBackupFolder(settings.backupPath)
      if (result.success) {
        console.log("[Scheduler] Borg sync (after backups) completed successfully")
      } else {
        console.error("[Scheduler] Borg sync (after backups) failed:", result.error)
      }
    } catch (error) {
      console.error("[Scheduler] Borg sync error:", error)
    }
  }, settings.bufferMinutes * 60 * 1000)
}

// Check and potentially trigger sync after a backup completes
async function checkAndTriggerBorgSync() {
  const settings = await getSyncSettings()

  if (!settings.enabled || settings.mode !== "after_backups") {
    return
  }

  // Check if borg is available
  const borgInstalled = await checkBorgInstalled()
  const sshpassInstalled = await checkSshpassInstalled()

  if (!borgInstalled || !sshpassInstalled) {
    return
  }

  // Check if all daily backups are complete
  const status = await checkAllDailyBackupsComplete()

  console.log(`[Scheduler] Backup completion check: ${status.completedJobs}/${status.totalJobs} jobs complete`)

  if (status.allComplete && status.totalJobs > 0) {
    await triggerSyncAfterBuffer()
  } else if (status.pendingJobs.length > 0) {
    console.log(`[Scheduler] Waiting for: ${status.pendingJobs.join(", ")}`)
  }
}

// Reset daily sync flag at midnight
function setupMidnightReset() {
  if (midnightResetTask) {
    midnightResetTask.stop()
  }

  midnightResetTask = cron.schedule("0 0 * * *", () => {
    console.log("[Scheduler] Midnight: Resetting daily sync flag")
    syncTriggeredToday = false

    if (pendingSyncTimeout) {
      clearTimeout(pendingSyncTimeout)
      pendingSyncTimeout = null
    }
  }, {
    timezone: TIMEZONE
  })
}

export async function initializeScheduler() {
  console.log("[Scheduler] Initializing...")

  // Setup midnight reset for daily sync flag
  setupMidnightReset()

  // Schedule daily summary email (default: 08:00)
  await scheduleDailySummary()

  // Schedule daily borg sync (based on mode: scheduled or after_backups)
  await scheduleBorgSync()

  // Schedule disk cleanup
  await scheduleCleanup()

  // Load all enabled backup jobs
  const backupJobs = await prisma.backupJob.findMany({
    where: { isEnabled: true },
    include: {
      database: {
        include: { server: true }
      }
    }
  })

  for (const job of backupJobs) {
    scheduleBackupJob(job.id, job.scheduleCron)
  }

  // Load all enabled maintenance jobs
  const maintenanceJobs = await prisma.maintenanceJob.findMany({
    where: { isEnabled: true },
    include: {
      database: {
        include: { server: true }
      }
    }
  })

  for (const job of maintenanceJobs) {
    scheduleMaintenanceJob(job.id, job.scheduleCron)
  }

  console.log(`[Scheduler] Initialized with ${backupJobs.length} backup jobs and ${maintenanceJobs.length} maintenance jobs`)
}

export function scheduleBackupJob(jobId: string, cronExpression: string) {
  // Remove existing schedule if any
  unscheduleJob(jobId)

  if (!cron.validate(cronExpression)) {
    console.error(`[Scheduler] Invalid cron expression for job ${jobId}: ${cronExpression}`)
    return
  }

  const task = cron.schedule(cronExpression, async () => {
    await executeBackupJob(jobId)
  }, {
    timezone: TIMEZONE
  })

  scheduledJobs.set(jobId, { jobId, task })
  console.log(`[Scheduler] Scheduled backup job ${jobId} with cron: ${cronExpression} (${TIMEZONE})`)
}

export function scheduleMaintenanceJob(jobId: string, cronExpression: string) {
  // Remove existing schedule if any
  unscheduleJob(jobId)

  if (!cron.validate(cronExpression)) {
    console.error(`[Scheduler] Invalid cron expression for job ${jobId}: ${cronExpression}`)
    return
  }

  const task = cron.schedule(cronExpression, async () => {
    await executeMaintenanceJob(jobId)
  }, {
    timezone: TIMEZONE
  })

  scheduledJobs.set(jobId, { jobId, task })
  console.log(`[Scheduler] Scheduled maintenance job ${jobId} with cron: ${cronExpression} (${TIMEZONE})`)
}

export function unscheduleJob(jobId: string) {
  const existing = scheduledJobs.get(jobId)
  if (existing) {
    existing.task.stop()
    scheduledJobs.delete(jobId)
    console.log(`[Scheduler] Unscheduled job ${jobId}`)
  }
}

export async function executeBackupJob(jobId: string) {
  console.log(`[Scheduler] Executing backup job ${jobId}`)

  const job = await prisma.backupJob.findUnique({
    where: { id: jobId },
    include: {
      database: {
        include: { server: true }
      }
    }
  })

  if (!job) {
    console.error(`[Scheduler] Backup job ${jobId} not found`)
    return
  }

  const startTime = new Date()

  // Create history record
  const history = await prisma.backupHistory.create({
    data: {
      jobId: job.id,
      databaseId: job.databaseId,
      backupType: job.backupType,
      status: "running"
    }
  })

  try {
    const pool = await createConnectionFromServer(job.database.server, "master")

    // Determine backup path - use default if not specified or set to "default"/"backup"
    let backupPath = job.storageTarget
    if (!backupPath || backupPath === "default" || backupPath === "backup" || backupPath.toLowerCase() === "default") {
      backupPath = await getDefaultBackupPath(pool)
      console.log(`[Scheduler] Using SQL Server default backup path: ${backupPath}`)
    }

    // Detect SQL Server edition for compression support
    const { edition, supportsCompression } = await getSqlServerEdition(pool)
    console.log(`[Scheduler] SQL Server Edition: ${edition}, Compression: ${supportsCompression ? 'supported' : 'not supported'}`)

    // Use native backup with auto-detected compression and checksum enabled
    const result = await executeBackup(
      pool,
      job.database.name,
      job.backupType as "FULL" | "DIFF" | "LOG",
      backupPath,
      { compress: supportsCompression, checksum: true }
    )

    await pool.close()

    const endTime = new Date()
    const durationMs = endTime.getTime() - startTime.getTime()
    const duration = Math.floor(durationMs / 1000)

    console.log(`[Scheduler] Backup completed. Start: ${startTime.toISOString()}, End: ${endTime.toISOString()}, Duration: ${duration}s (${durationMs}ms), Size: ${result.sizeMb}MB`)

    // Update history
    await prisma.backupHistory.update({
      where: { id: history.id },
      data: {
        completedAt: endTime,
        status: result.success ? "success" : "failed",
        filePath: result.filePath,
        sizeMb: result.sizeMb,
        errorMsg: result.success ? null : result.message,
        duration
      }
    })

    // Update database last backup time
    if (result.success) {
      const updateData: Record<string, Date> = {}
      if (job.backupType === "FULL") {
        updateData.lastBackupFull = endTime
      } else if (job.backupType === "DIFF") {
        updateData.lastBackupDiff = endTime
      }

      await prisma.database.update({
        where: { id: job.databaseId },
        data: updateData
      })
    }

    console.log(`[Scheduler] Backup job ${jobId} completed: ${result.success ? "success" : "failed"}`)

    // Send failure alert if job failed
    if (!result.success) {
      await sendFailureAlertForJob(
        "backup",
        job.database.name,
        job.database.server.name,
        startTime,
        duration,
        result.message || "Unknown error",
        job.backupType
      )
    }
  } catch (error) {
    const endTime = new Date()
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
    const errorMsg = error instanceof Error ? error.message : "Unknown error"

    await prisma.backupHistory.update({
      where: { id: history.id },
      data: {
        completedAt: endTime,
        status: "failed",
        errorMsg,
        duration
      }
    })

    // Send failure alert
    await sendFailureAlertForJob(
      "backup",
      job.database.name,
      job.database.server.name,
      startTime,
      duration,
      errorMsg,
      job.backupType
    )

    console.error(`[Scheduler] Backup job ${jobId} failed:`, error)
  }

  // Check if all backups are complete and trigger sync if needed
  await checkAndTriggerBorgSync()
}

export async function executeMaintenanceJob(jobId: string) {
  console.log(`[Scheduler] Executing maintenance job ${jobId}`)

  const job = await prisma.maintenanceJob.findUnique({
    where: { id: jobId },
    include: {
      database: {
        include: { server: true }
      }
    }
  })

  if (!job) {
    console.error(`[Scheduler] Maintenance job ${jobId} not found`)
    return
  }

  const startTime = new Date()

  // Create history record
  const history = await prisma.maintenanceHistory.create({
    data: {
      jobId: job.id,
      databaseId: job.databaseId,
      maintenanceType: job.maintenanceType,
      status: "running"
    }
  })

  try {
    const pool = await createConnectionFromServer(job.database.server, "master")

    let success = false
    let message = ""

    const options = job.options ? JSON.parse(job.options) : {}

    switch (job.maintenanceType) {
      case "INDEX":
        const indexResult = await pool.request().query(`
          EXECUTE dbo.IndexOptimize
            @Databases = '${job.database.name}',
            @FragmentationLow = NULL,
            @FragmentationMedium = 'INDEX_REORGANIZE',
            @FragmentationHigh = 'INDEX_REBUILD_ONLINE,INDEX_REBUILD_OFFLINE',
            @FragmentationLevel1 = ${options.fragmentationLevel1 || 5},
            @FragmentationLevel2 = ${options.fragmentationLevel2 || 30},
            @LogToTable = 'Y'
        `)
        success = true
        message = "Index optimization completed"
        break

      case "INTEGRITY":
        await pool.request().query(`
          EXECUTE dbo.DatabaseIntegrityCheck
            @Databases = '${job.database.name}',
            @LogToTable = 'Y'
        `)
        success = true
        message = "Integrity check completed"
        break

      case "STATS":
        await pool.request().query(`
          USE [${job.database.name}];
          EXEC sp_updatestats;
        `)
        success = true
        message = "Statistics update completed"
        break
    }

    await pool.close()

    const endTime = new Date()
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)

    await prisma.maintenanceHistory.update({
      where: { id: history.id },
      data: {
        completedAt: endTime,
        status: success ? "success" : "failed",
        details: JSON.stringify({ message }),
        duration
      }
    })

    console.log(`[Scheduler] Maintenance job ${jobId} completed: ${success ? "success" : "failed"}`)
  } catch (error) {
    const endTime = new Date()
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
    const errorMsg = error instanceof Error ? error.message : "Unknown error"

    await prisma.maintenanceHistory.update({
      where: { id: history.id },
      data: {
        completedAt: endTime,
        status: "failed",
        errorMsg,
        duration
      }
    })

    // Send failure alert
    await sendFailureAlertForJob(
      "maintenance",
      job.database.name,
      job.database.server.name,
      startTime,
      duration,
      errorMsg,
      job.maintenanceType
    )

    console.error(`[Scheduler] Maintenance job ${jobId} failed:`, error)
  }
}

export function getScheduledJobs() {
  return Array.from(scheduledJobs.keys())
}

export function getScheduledJobsCount() {
  return scheduledJobs.size
}

export function isJobScheduled(jobId: string) {
  return scheduledJobs.has(jobId)
}

// Schedule daily summary email
export async function scheduleDailySummary() {
  // Stop existing task if any
  if (dailySummaryTask) {
    dailySummaryTask.stop()
    dailySummaryTask = null
  }

  // Get configured summary time from database
  let summaryTime = "08:00"
  let enabled = true

  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: ["summary_time", "daily_summary_enabled"] }
      }
    })

    for (const s of settings) {
      if (s.key === "summary_time") summaryTime = s.value
      if (s.key === "daily_summary_enabled") enabled = s.value === "true"
    }
  } catch {
    // Settings table might not exist yet
  }

  if (!enabled) {
    console.log("[Scheduler] Daily summary email is disabled")
    return
  }

  // Parse time (HH:MM format)
  const [hour, minute] = summaryTime.split(":").map(Number)
  const cronExpr = `${minute} ${hour} * * *`

  if (!cron.validate(cronExpr)) {
    console.error(`[Scheduler] Invalid cron expression for daily summary: ${cronExpr}`)
    return
  }

  dailySummaryTask = cron.schedule(cronExpr, async () => {
    console.log("[Scheduler] Sending daily summary email...")
    try {
      const sent = await sendDailySummaryEmail()
      if (sent) {
        console.log("[Scheduler] Daily summary email sent successfully")
      } else {
        console.log("[Scheduler] Daily summary email not sent (no jobs or no recipients)")
      }
    } catch (error) {
      console.error("[Scheduler] Failed to send daily summary email:", error)
    }
  }, {
    timezone: TIMEZONE
  })

  console.log(`[Scheduler] Daily summary scheduled at ${summaryTime} (${TIMEZONE})`)
}

// Send failure alert for a job
async function sendFailureAlertForJob(
  type: "backup" | "maintenance",
  database: string,
  server: string,
  startedAt: Date,
  duration: number | null,
  errorMsg: string | null,
  jobType?: string
) {
  // Check if failure alerts are enabled
  try {
    const settingRecord = await prisma.setting.findFirst({
      where: { key: "failure_alerts_enabled" }
    })
    if (settingRecord?.value === "false") {
      console.log("[Scheduler] Failure alerts are disabled")
      return
    }
  } catch {
    // Settings table might not exist, proceed with alert
  }

  const jobResult: JobResult = {
    id: "",
    type,
    database,
    server,
    status: "failed",
    startedAt,
    duration,
    errorMsg,
    ...(type === "backup" ? { backupType: jobType } : { maintenanceType: jobType })
  }

  try {
    const sent = await sendJobFailureAlert(jobResult)
    if (sent) {
      console.log(`[Scheduler] Failure alert sent for ${type} job on ${database}`)
    }
  } catch (error) {
    console.error("[Scheduler] Failed to send failure alert:", error)
  }
}

// Schedule daily borg sync to Hetzner StorageBox
export async function scheduleBorgSync() {
  // Stop existing task if any
  if (borgSyncTask) {
    borgSyncTask.stop()
    borgSyncTask = null
  }

  // Get sync settings
  const settings = await getSyncSettings()

  if (!settings.enabled) {
    console.log("[Scheduler] Borg sync is disabled")
    return
  }

  // Check if borg is installed
  const borgInstalled = await checkBorgInstalled()
  const sshpassInstalled = await checkSshpassInstalled()

  if (!borgInstalled || !sshpassInstalled) {
    console.log("[Scheduler] Borg or sshpass not installed, skipping borg sync scheduling")
    return
  }

  // Handle different sync modes
  if (settings.mode === "manual") {
    console.log("[Scheduler] Borg sync mode: manual (no automatic scheduling)")
    return
  }

  if (settings.mode === "after_backups") {
    console.log(`[Scheduler] Borg sync mode: after_backups (will sync ${settings.bufferMinutes} min after all backups complete)`)
    return
  }

  // Mode: scheduled - use cron
  // Parse time (HH:MM format)
  const [hour, minute] = settings.syncTime.split(":").map(Number)
  const cronExpr = `${minute} ${hour} * * *`

  if (!cron.validate(cronExpr)) {
    console.error(`[Scheduler] Invalid cron expression for borg sync: ${cronExpr}`)
    return
  }

  borgSyncTask = cron.schedule(cronExpr, async () => {
    console.log("[Scheduler] Starting scheduled borg sync...")
    syncTriggeredToday = true
    try {
      const result = await syncBackupFolder(settings.backupPath)
      if (result.success) {
        console.log("[Scheduler] Borg sync completed successfully")
      } else {
        console.error("[Scheduler] Borg sync failed:", result.error)
      }
    } catch (error) {
      console.error("[Scheduler] Borg sync error:", error)
    }
  }, {
    timezone: TIMEZONE
  })

  console.log(`[Scheduler] Borg sync mode: scheduled at ${settings.syncTime} (${TIMEZONE})`)
}

// Schedule disk cleanup
export async function scheduleCleanup() {
  // Stop existing cleanup task
  if (cleanupTask) {
    cleanupTask.stop()
    cleanupTask = null
    console.log("[Scheduler] Stopped existing cleanup task")
  }

  const settings = await getCleanupSettings()

  if (!settings.enabled) {
    console.log("[Scheduler] Disk cleanup is disabled")
    return
  }

  if (!cron.validate(settings.schedule)) {
    console.error(`[Scheduler] Invalid cron expression for cleanup: ${settings.schedule}`)
    return
  }

  cleanupTask = cron.schedule(settings.schedule, async () => {
    console.log("[Scheduler] Starting scheduled disk cleanup...")
    try {
      const result = await executeCleanup(false)
      if (result.success) {
        console.log(`[Scheduler] Cleanup completed: ${result.deletedFiles} files deleted (${result.deletedSizeMb.toFixed(2)} MB)`)
      } else {
        console.error(`[Scheduler] Cleanup completed with ${result.errors.length} errors`)
      }
    } catch (error) {
      console.error("[Scheduler] Cleanup error:", error)
    }
  }, {
    timezone: TIMEZONE
  })

  console.log(`[Scheduler] Disk cleanup scheduled: ${settings.schedule} (${TIMEZONE})`)
}
