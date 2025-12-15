import { prisma } from './db'
import fs from 'fs'
import path from 'path'

// Cleanup settings interface
export interface CleanupSettings {
  enabled: boolean
  schedule: string // cron format
  keepFullCount: number // how many FULL backups to keep per database
  keepDiffPerFull: number // how many DIFFs to keep per FULL
  keepOrphanDiff: boolean // keep DIFFs without parent FULL?
  lastRunAt: Date | null
  lastRunStatus: 'success' | 'failed' | null
  lastRunMessage: string | null
}

// Backup file info
export interface BackupFileInfo {
  filePath: string
  fileName: string
  databaseName: string
  backupType: 'FULL' | 'DIFF' | 'LOG'
  date: Date
  sizeMb: number
  historyId?: string
}

// Backup chain (FULL + related DIFFs)
export interface BackupChain {
  full: BackupFileInfo
  diffs: BackupFileInfo[]
}

// Cleanup analysis result
export interface CleanupAnalysis {
  totalFiles: number
  totalSizeMb: number
  filesToDelete: BackupFileInfo[]
  filesToKeep: BackupFileInfo[]
  deleteSizeMb: number
  keepSizeMb: number
  byDatabase: Record<string, {
    totalFiles: number
    deleteFiles: number
    keepFiles: number
    deleteSizeMb: number
  }>
}

// Cleanup result
export interface CleanupResult {
  success: boolean
  deletedFiles: number
  deletedSizeMb: number
  errors: string[]
  details: Array<{
    filePath: string
    deleted: boolean
    error?: string
  }>
}

// Default settings
const DEFAULT_SETTINGS: CleanupSettings = {
  enabled: false,
  schedule: '0 6 * * 0', // Every Sunday at 06:00
  keepFullCount: 2,
  keepDiffPerFull: 1,
  keepOrphanDiff: false,
  lastRunAt: null,
  lastRunStatus: null,
  lastRunMessage: null
}

/**
 * Get cleanup settings from database
 */
export async function getCleanupSettings(): Promise<CleanupSettings> {
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          startsWith: 'cleanup_'
        }
      }
    })

    const settingsMap: Record<string, string> = {}
    settings.forEach(s => {
      settingsMap[s.key] = s.value
    })

    return {
      enabled: settingsMap['cleanup_enabled'] === 'true',
      schedule: settingsMap['cleanup_schedule'] || DEFAULT_SETTINGS.schedule,
      keepFullCount: parseInt(settingsMap['cleanup_keep_full_count'] || '2', 10),
      keepDiffPerFull: parseInt(settingsMap['cleanup_keep_diff_per_full'] || '1', 10),
      keepOrphanDiff: settingsMap['cleanup_keep_orphan_diff'] === 'true',
      lastRunAt: settingsMap['cleanup_last_run_at'] ? new Date(settingsMap['cleanup_last_run_at']) : null,
      lastRunStatus: (settingsMap['cleanup_last_run_status'] as 'success' | 'failed') || null,
      lastRunMessage: settingsMap['cleanup_last_run_message'] || null
    }
  } catch (error) {
    console.error('[Cleanup] Failed to get settings:', error)
    return DEFAULT_SETTINGS
  }
}

/**
 * Save cleanup settings to database
 */
export async function saveCleanupSettings(settings: Partial<CleanupSettings>): Promise<void> {
  const updates: Array<{ key: string; value: string }> = []

  if (settings.enabled !== undefined) {
    updates.push({ key: 'cleanup_enabled', value: String(settings.enabled) })
  }
  if (settings.schedule !== undefined) {
    updates.push({ key: 'cleanup_schedule', value: settings.schedule })
  }
  if (settings.keepFullCount !== undefined) {
    updates.push({ key: 'cleanup_keep_full_count', value: String(settings.keepFullCount) })
  }
  if (settings.keepDiffPerFull !== undefined) {
    updates.push({ key: 'cleanup_keep_diff_per_full', value: String(settings.keepDiffPerFull) })
  }
  if (settings.keepOrphanDiff !== undefined) {
    updates.push({ key: 'cleanup_keep_orphan_diff', value: String(settings.keepOrphanDiff) })
  }
  if (settings.lastRunAt !== undefined) {
    updates.push({ key: 'cleanup_last_run_at', value: settings.lastRunAt?.toISOString() || '' })
  }
  if (settings.lastRunStatus !== undefined) {
    updates.push({ key: 'cleanup_last_run_status', value: settings.lastRunStatus || '' })
  }
  if (settings.lastRunMessage !== undefined) {
    updates.push({ key: 'cleanup_last_run_message', value: settings.lastRunMessage || '' })
  }

  for (const { key, value } of updates) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    })
  }
}

/**
 * Get default backup path from settings
 */
async function getDefaultBackupPath(): Promise<string> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'default_backup_path' }
    })
    return setting?.value || '/var/opt/mssql/backup'
  } catch {
    return '/var/opt/mssql/backup'
  }
}

/**
 * Parse backup filename to extract info
 * New format: DBName_TYPE_YYYYMMDD_HHMMSS.bak
 * Old format: DBName_TYPE_HHMMSS.bak (for backwards compatibility)
 */
function parseBackupFileName(fileName: string): { databaseName: string; backupType: 'FULL' | 'DIFF' | 'LOG'; date: string | null; time: string } | null {
  // Try new format first: DBName_TYPE_YYYYMMDD_HHMMSS.bak
  const newMatch = fileName.match(/^(.+)_(FULL|DIFF|LOG)_(\d{8})_(\d{6})\.bak$/i)
  if (newMatch) {
    return {
      databaseName: newMatch[1],
      backupType: newMatch[2].toUpperCase() as 'FULL' | 'DIFF' | 'LOG',
      date: newMatch[3], // YYYYMMDD
      time: newMatch[4]  // HHMMSS
    }
  }

  // Fall back to old format: DBName_TYPE_HHMMSS.bak
  const oldMatch = fileName.match(/^(.+)_(FULL|DIFF|LOG)_(\d{6})\.bak$/i)
  if (oldMatch) {
    return {
      databaseName: oldMatch[1],
      backupType: oldMatch[2].toUpperCase() as 'FULL' | 'DIFF' | 'LOG',
      date: null, // No date in old format, will use folder date
      time: oldMatch[3]
    }
  }

  return null
}

/**
 * Scan backup directory and collect all backup files
 */
export async function scanBackupFiles(backupPath?: string): Promise<BackupFileInfo[]> {
  const basePath = backupPath || await getDefaultBackupPath()
  const files: BackupFileInfo[] = []

  // Also get files from BackupHistory for cross-reference
  const historyFiles = await prisma.backupHistory.findMany({
    where: {
      filePath: { not: null },
      status: 'success'
    },
    select: {
      id: true,
      filePath: true,
      backupType: true,
      sizeMb: true,
      startedAt: true,
      database: {
        select: { name: true }
      }
    }
  })

  const historyMap = new Map<string, { id: string; sizeMb: number | null }>()
  historyFiles.forEach(h => {
    if (h.filePath) {
      historyMap.set(h.filePath, { id: h.id, sizeMb: h.sizeMb })
    }
  })

  // Scan FULL and DIFF directories
  for (const backupType of ['FULL', 'DIFF', 'LOG']) {
    const typePath = path.join(basePath, backupType)

    if (!fs.existsSync(typePath)) continue

    // List date folders
    const dateFolders = fs.readdirSync(typePath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)

    for (const dateFolder of dateFolders) {
      const datePath = path.join(typePath, dateFolder)
      const date = new Date(dateFolder)

      if (isNaN(date.getTime())) continue

      // List backup files in date folder
      const bakFiles = fs.readdirSync(datePath, { withFileTypes: true })
        .filter(f => f.isFile() && f.name.endsWith('.bak'))
        .map(f => f.name)

      for (const bakFile of bakFiles) {
        const parsed = parseBackupFileName(bakFile)
        if (!parsed) continue

        const fullPath = path.join(datePath, bakFile)
        const stats = fs.statSync(fullPath)
        const historyInfo = historyMap.get(fullPath)

        // Create precise date from filename or folder
        let preciseDate: Date

        if (parsed.date && parsed.date.length === 8) {
          // New format: use date from filename (YYYYMMDD)
          const year = parseInt(parsed.date.substring(0, 4), 10)
          const month = parseInt(parsed.date.substring(4, 6), 10) - 1
          const day = parseInt(parsed.date.substring(6, 8), 10)
          preciseDate = new Date(year, month, day)
        } else {
          // Old format: use folder date
          preciseDate = new Date(date)
        }

        // Add time from filename (HHMMSS)
        if (parsed.time && parsed.time.length === 6) {
          const hours = parseInt(parsed.time.substring(0, 2), 10)
          const minutes = parseInt(parsed.time.substring(2, 4), 10)
          const seconds = parseInt(parsed.time.substring(4, 6), 10)
          preciseDate.setHours(hours, minutes, seconds, 0)
        }

        files.push({
          filePath: fullPath,
          fileName: bakFile,
          databaseName: parsed.databaseName,
          backupType: parsed.backupType,
          date: preciseDate,
          sizeMb: historyInfo?.sizeMb || (stats.size / (1024 * 1024)),
          historyId: historyInfo?.id
        })
      }
    }
  }

  return files.sort((a, b) => b.date.getTime() - a.date.getTime())
}

/**
 * Group backup files into chains (FULL + DIFFs)
 * DIFFs taken on or after a FULL's date belong to that FULL (until the next FULL)
 */
export function groupIntoChains(files: BackupFileInfo[]): Map<string, BackupChain[]> {
  const byDatabase = new Map<string, BackupFileInfo[]>()

  // Group by database
  files.forEach(f => {
    const existing = byDatabase.get(f.databaseName) || []
    existing.push(f)
    byDatabase.set(f.databaseName, existing)
  })

  const chains = new Map<string, BackupChain[]>()

  byDatabase.forEach((dbFiles, dbName) => {
    // Sort FULLs by date, newest first
    const fulls = dbFiles
      .filter(f => f.backupType === 'FULL')
      .sort((a, b) => b.date.getTime() - a.date.getTime())

    // Sort DIFFs by date, newest first
    const diffs = dbFiles
      .filter(f => f.backupType === 'DIFF')
      .sort((a, b) => b.date.getTime() - a.date.getTime())

    const dbChains: BackupChain[] = []
    const assignedDiffs = new Set<string>()

    // Each FULL creates a chain
    // FULLs are sorted newest first, so index 0 is the newest FULL
    fulls.forEach((full, index) => {
      // Get the next newer FULL (if exists) - since array is sorted newest first,
      // the "newer" FULL is at index - 1
      const newerFull = index > 0 ? fulls[index - 1] : null

      // Find DIFFs that belong to this FULL:
      // - DIFF date >= FULL date (on same day or after)
      // - AND (no newer FULL OR DIFF date < newer FULL date)
      const belongingDiffs = diffs.filter(d => {
        // Skip if already assigned to another chain
        if (assignedDiffs.has(d.filePath)) return false

        // DIFF must be on or after this FULL's date
        const onOrAfterFull = d.date.getTime() >= full.date.getTime()

        // DIFF must be before the newer FULL's date (if exists)
        const beforeNewerFull = !newerFull || d.date.getTime() < newerFull.date.getTime()

        return onOrAfterFull && beforeNewerFull
      })

      // Mark these DIFFs as assigned
      belongingDiffs.forEach(d => assignedDiffs.add(d.filePath))

      dbChains.push({
        full,
        diffs: belongingDiffs.sort((a, b) => b.date.getTime() - a.date.getTime())
      })
    })

    chains.set(dbName, dbChains)
  })

  return chains
}

/**
 * Analyze which files should be deleted based on retention policy
 */
export async function analyzeCleanup(settings?: CleanupSettings): Promise<CleanupAnalysis> {
  const config = settings || await getCleanupSettings()
  const files = await scanBackupFiles()
  const chains = groupIntoChains(files)

  const filesToDelete: BackupFileInfo[] = []
  const filesToKeep: BackupFileInfo[] = []
  const byDatabase: CleanupAnalysis['byDatabase'] = {}

  chains.forEach((dbChains, dbName) => {
    byDatabase[dbName] = {
      totalFiles: 0,
      deleteFiles: 0,
      keepFiles: 0,
      deleteSizeMb: 0
    }

    dbChains.forEach((chain, chainIndex) => {
      const keepChain = chainIndex < config.keepFullCount

      if (keepChain) {
        // Keep the FULL
        filesToKeep.push(chain.full)
        byDatabase[dbName].keepFiles++
        byDatabase[dbName].totalFiles++

        // Keep only the newest N DIFFs
        chain.diffs.forEach((diff, diffIndex) => {
          if (diffIndex < config.keepDiffPerFull) {
            filesToKeep.push(diff)
            byDatabase[dbName].keepFiles++
          } else {
            filesToDelete.push(diff)
            byDatabase[dbName].deleteFiles++
            byDatabase[dbName].deleteSizeMb += diff.sizeMb
          }
          byDatabase[dbName].totalFiles++
        })
      } else {
        // Delete entire chain
        filesToDelete.push(chain.full)
        byDatabase[dbName].deleteFiles++
        byDatabase[dbName].deleteSizeMb += chain.full.sizeMb
        byDatabase[dbName].totalFiles++

        chain.diffs.forEach(diff => {
          filesToDelete.push(diff)
          byDatabase[dbName].deleteFiles++
          byDatabase[dbName].deleteSizeMb += diff.sizeMb
          byDatabase[dbName].totalFiles++
        })
      }
    })
  })

  // Handle orphan DIFFs (DIFFs without a parent FULL)
  // An orphan DIFF is one where there's no FULL on the same date or earlier
  const allFulls = files.filter(f => f.backupType === 'FULL')
  const orphanDiffs = files.filter(f => {
    if (f.backupType !== 'DIFF') return false
    // Check if there's a FULL for this database on or before this DIFF's date
    const hasParentFull = allFulls.some(
      full => full.databaseName === f.databaseName && full.date.getTime() <= f.date.getTime()
    )
    return !hasParentFull
  })

  if (!config.keepOrphanDiff) {
    orphanDiffs.forEach(diff => {
      // Only add to delete if not already in keep or delete lists
      const alreadyInKeep = filesToKeep.find(f => f.filePath === diff.filePath)
      const alreadyInDelete = filesToDelete.find(f => f.filePath === diff.filePath)

      if (!alreadyInKeep && !alreadyInDelete) {
        filesToDelete.push(diff)
        if (byDatabase[diff.databaseName]) {
          byDatabase[diff.databaseName].deleteFiles++
          byDatabase[diff.databaseName].deleteSizeMb += diff.sizeMb
        }
      }
    })
  }

  return {
    totalFiles: files.length,
    totalSizeMb: files.reduce((sum, f) => sum + f.sizeMb, 0),
    filesToDelete,
    filesToKeep,
    deleteSizeMb: filesToDelete.reduce((sum, f) => sum + f.sizeMb, 0),
    keepSizeMb: filesToKeep.reduce((sum, f) => sum + f.sizeMb, 0),
    byDatabase
  }
}

/**
 * Execute cleanup - actually delete files
 */
export async function executeCleanup(dryRun: boolean = false): Promise<CleanupResult> {
  const startTime = new Date()
  const analysis = await analyzeCleanup()
  const errors: string[] = []
  const details: CleanupResult['details'] = []
  let deletedCount = 0
  let deletedSize = 0

  // Create history record
  let historyRecord = await prisma.cleanupHistory.create({
    data: {
      startedAt: startTime,
      status: 'running',
      dryRun
    }
  })

  console.log(`[Cleanup] Starting cleanup (dryRun: ${dryRun})`)
  console.log(`[Cleanup] Files to delete: ${analysis.filesToDelete.length}`)
  console.log(`[Cleanup] Size to free: ${analysis.deleteSizeMb.toFixed(2)} MB`)

  for (const file of analysis.filesToDelete) {
    try {
      if (!dryRun) {
        // Delete the file
        if (fs.existsSync(file.filePath)) {
          fs.unlinkSync(file.filePath)
          console.log(`[Cleanup] Deleted: ${file.filePath}`)

          // Update BackupHistory if exists
          if (file.historyId) {
            await prisma.backupHistory.update({
              where: { id: file.historyId },
              data: {
                filePath: null, // Mark as deleted
                status: 'deleted'
              }
            }).catch(() => {
              // Ignore if history update fails
            })
          }

          deletedCount++
          deletedSize += file.sizeMb
        }
      } else {
        console.log(`[Cleanup] Would delete: ${file.filePath}`)
        deletedCount++
        deletedSize += file.sizeMb
      }

      details.push({
        filePath: file.filePath,
        deleted: !dryRun
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Failed to delete ${file.filePath}: ${errorMsg}`)
      details.push({
        filePath: file.filePath,
        deleted: false,
        error: errorMsg
      })
    }
  }

  // Clean up empty directories
  if (!dryRun) {
    await cleanEmptyDirectories(await getDefaultBackupPath())
  }

  // Save run status
  const endTime = new Date()
  const success = errors.length === 0
  const message = dryRun
    ? `Dry run completed. Would delete ${deletedCount} files (${deletedSize.toFixed(2)} MB)`
    : `Deleted ${deletedCount} files (${deletedSize.toFixed(2)} MB)${errors.length > 0 ? `. ${errors.length} errors.` : ''}`

  // Update history record
  await prisma.cleanupHistory.update({
    where: { id: historyRecord.id },
    data: {
      completedAt: endTime,
      status: success ? 'success' : 'failed',
      filesDeleted: deletedCount,
      sizeMbFreed: deletedSize,
      errorMsg: errors.length > 0 ? errors.join('\n') : null,
      duration: Math.round((endTime.getTime() - startTime.getTime()) / 1000),
      details: JSON.stringify(details.slice(0, 100)) // Limit to 100 entries
    }
  })

  await saveCleanupSettings({
    lastRunAt: startTime,
    lastRunStatus: success ? 'success' : 'failed',
    lastRunMessage: message
  })

  console.log(`[Cleanup] ${message}`)

  return {
    success,
    deletedFiles: deletedCount,
    deletedSizeMb: deletedSize,
    errors,
    details
  }
}

/**
 * Clean up empty directories
 */
async function cleanEmptyDirectories(basePath: string): Promise<void> {
  try {
    for (const backupType of ['FULL', 'DIFF', 'LOG']) {
      const typePath = path.join(basePath, backupType)
      if (!fs.existsSync(typePath)) continue

      const dateFolders = fs.readdirSync(typePath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)

      for (const dateFolder of dateFolders) {
        const datePath = path.join(typePath, dateFolder)
        const files = fs.readdirSync(datePath)

        if (files.length === 0) {
          fs.rmdirSync(datePath)
          console.log(`[Cleanup] Removed empty directory: ${datePath}`)
        }
      }
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning directories:', error)
  }
}

/**
 * Get cleanup status summary
 */
export async function getCleanupStatus(): Promise<{
  settings: CleanupSettings
  analysis: CleanupAnalysis
}> {
  const settings = await getCleanupSettings()
  const analysis = await analyzeCleanup(settings)

  return { settings, analysis }
}
