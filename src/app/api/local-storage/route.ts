import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import fs from "fs"
import path from "path"

interface BackupFileInfo {
  filePath: string
  fileName: string
  databaseName: string
  backupType: "FULL" | "DIFF" | "LOG"
  date: Date
  sizeMb: number
}

interface FolderStats {
  path: string
  exists: boolean
  totalFiles: number
  totalSizeMb: number
  fullBackups: number
  diffBackups: number
  logBackups: number
  fullSizeMb: number
  diffSizeMb: number
  logSizeMb: number
  databaseCount: number
  databases: Array<{
    name: string
    fullCount: number
    diffCount: number
    logCount: number
    totalSizeMb: number
    lastBackup: Date | null
  }>
  recentBackups: BackupFileInfo[]
  oldestBackup: Date | null
  newestBackup: Date | null
}

async function getDefaultBackupPath(): Promise<string> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "default_backup_path" }
    })
    return setting?.value || "/var/opt/mssql/backup"
  } catch {
    return "/var/opt/mssql/backup"
  }
}

/**
 * Parse backup filename to extract info
 * New format: DBName_TYPE_YYYYMMDD_HHMMSS.bak
 * Old format: DBName_TYPE_HHMMSS.bak (for backwards compatibility)
 */
function parseBackupFileName(fileName: string): { databaseName: string; backupType: "FULL" | "DIFF" | "LOG"; date: string | null; time: string } | null {
  // Try new format first: DBName_TYPE_YYYYMMDD_HHMMSS.bak
  const newMatch = fileName.match(/^(.+)_(FULL|DIFF|LOG)_(\d{8})_(\d{6})\.bak$/i)
  if (newMatch) {
    return {
      databaseName: newMatch[1],
      backupType: newMatch[2].toUpperCase() as "FULL" | "DIFF" | "LOG",
      date: newMatch[3], // YYYYMMDD
      time: newMatch[4]  // HHMMSS
    }
  }

  // Fall back to old format: DBName_TYPE_HHMMSS.bak
  const oldMatch = fileName.match(/^(.+)_(FULL|DIFF|LOG)_(\d{6})\.bak$/i)
  if (oldMatch) {
    return {
      databaseName: oldMatch[1],
      backupType: oldMatch[2].toUpperCase() as "FULL" | "DIFF" | "LOG",
      date: null, // No date in old format, will use folder date
      time: oldMatch[3]
    }
  }

  return null
}

async function scanBackupFolder(backupPath: string): Promise<FolderStats> {
  const stats: FolderStats = {
    path: backupPath,
    exists: false,
    totalFiles: 0,
    totalSizeMb: 0,
    fullBackups: 0,
    diffBackups: 0,
    logBackups: 0,
    fullSizeMb: 0,
    diffSizeMb: 0,
    logSizeMb: 0,
    databaseCount: 0,
    databases: [],
    recentBackups: [],
    oldestBackup: null,
    newestBackup: null
  }

  if (!fs.existsSync(backupPath)) {
    return stats
  }

  stats.exists = true
  const files: BackupFileInfo[] = []
  const dbMap = new Map<string, {
    fullCount: number
    diffCount: number
    logCount: number
    totalSizeMb: number
    lastBackup: Date | null
  }>()

  // Scan FULL, DIFF, LOG directories
  for (const backupType of ["FULL", "DIFF", "LOG"]) {
    const typePath = path.join(backupPath, backupType)

    if (!fs.existsSync(typePath)) continue

    // List date folders
    let dateFolders: string[] = []
    try {
      dateFolders = fs.readdirSync(typePath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
    } catch {
      continue
    }

    for (const dateFolder of dateFolders) {
      const datePath = path.join(typePath, dateFolder)
      const date = new Date(dateFolder)

      if (isNaN(date.getTime())) continue

      // List backup files
      let bakFiles: string[] = []
      try {
        bakFiles = fs.readdirSync(datePath, { withFileTypes: true })
          .filter(f => f.isFile() && f.name.endsWith(".bak"))
          .map(f => f.name)
      } catch {
        continue
      }

      for (const bakFile of bakFiles) {
        const parsed = parseBackupFileName(bakFile)
        if (!parsed) continue

        const fullPath = path.join(datePath, bakFile)
        let fileStats: fs.Stats
        try {
          fileStats = fs.statSync(fullPath)
        } catch {
          continue
        }

        const sizeMb = fileStats.size / (1024 * 1024)

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

        const fileInfo: BackupFileInfo = {
          filePath: fullPath,
          fileName: bakFile,
          databaseName: parsed.databaseName,
          backupType: parsed.backupType,
          date: preciseDate,
          sizeMb: sizeMb
        }

        files.push(fileInfo)
        stats.totalFiles++
        stats.totalSizeMb += sizeMb

        // Update type-specific stats
        switch (parsed.backupType) {
          case "FULL":
            stats.fullBackups++
            stats.fullSizeMb += sizeMb
            break
          case "DIFF":
            stats.diffBackups++
            stats.diffSizeMb += sizeMb
            break
          case "LOG":
            stats.logBackups++
            stats.logSizeMb += sizeMb
            break
        }

        // Update database stats
        const dbStats = dbMap.get(parsed.databaseName) || {
          fullCount: 0,
          diffCount: 0,
          logCount: 0,
          totalSizeMb: 0,
          lastBackup: null
        }

        if (parsed.backupType === "FULL") dbStats.fullCount++
        if (parsed.backupType === "DIFF") dbStats.diffCount++
        if (parsed.backupType === "LOG") dbStats.logCount++
        dbStats.totalSizeMb += sizeMb
        if (!dbStats.lastBackup || date > dbStats.lastBackup) {
          dbStats.lastBackup = date
        }
        dbMap.set(parsed.databaseName, dbStats)

        // Track oldest/newest
        if (!stats.oldestBackup || date < stats.oldestBackup) {
          stats.oldestBackup = date
        }
        if (!stats.newestBackup || date > stats.newestBackup) {
          stats.newestBackup = date
        }
      }
    }
  }

  // Convert database map to array
  stats.databases = Array.from(dbMap.entries()).map(([name, s]) => ({
    name,
    ...s
  })).sort((a, b) => b.totalSizeMb - a.totalSizeMb)

  stats.databaseCount = stats.databases.length

  // Get recent backups (sorted by date, newest first)
  stats.recentBackups = files
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 20)

  return stats
}

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const backupPath = await getDefaultBackupPath()
    const folderStats = await scanBackupFolder(backupPath)

    // Get cleanup settings for display
    const cleanupSettings = await prisma.setting.findMany({
      where: {
        key: { startsWith: "cleanup_" }
      }
    })

    const settingsMap: Record<string, string> = {}
    cleanupSettings.forEach(s => {
      settingsMap[s.key] = s.value
    })

    const cleanup = {
      enabled: settingsMap["cleanup_enabled"] === "true",
      lastRunAt: settingsMap["cleanup_last_run_at"] || null,
      lastRunStatus: settingsMap["cleanup_last_run_status"] || null,
      lastRunMessage: settingsMap["cleanup_last_run_message"] || null,
      keepFullCount: parseInt(settingsMap["cleanup_keep_full_count"] || "2", 10),
      keepDiffPerFull: parseInt(settingsMap["cleanup_keep_diff_per_full"] || "1", 10)
    }

    return NextResponse.json({
      ...folderStats,
      cleanup
    })
  } catch (error) {
    console.error("Failed to get local storage stats:", error)
    return NextResponse.json(
      { error: "Failed to get local storage stats" },
      { status: 500 }
    )
  }
}
