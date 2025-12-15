import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { exec } from "child_process"
import { promisify } from "util"
import * as fs from "fs"
import * as path from "path"

const execAsync = promisify(exec)

interface DiskStats {
  totalGb: number
  usedGb: number
  freeGb: number
  usedPercent: number
  backupFolderGb: number
  backupFolderPath: string
  error?: string
}

async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      return 0
    }

    // Use du command for efficiency on Linux
    const { stdout } = await execAsync(`du -sb "${dirPath}" 2>/dev/null || echo "0"`)
    const sizeBytes = parseInt(stdout.split('\t')[0]) || 0
    return sizeBytes / (1024 * 1024 * 1024) // Convert to GB
  } catch {
    // Fallback: walk directory manually
    try {
      let totalSize = 0
      const files = fs.readdirSync(dirPath, { withFileTypes: true })

      for (const file of files) {
        const filePath = path.join(dirPath, file.name)
        if (file.isDirectory()) {
          totalSize += await getDirectorySize(filePath)
        } else {
          try {
            const stats = fs.statSync(filePath)
            totalSize += stats.size / (1024 * 1024 * 1024)
          } catch {
            // Skip files we can't access
          }
        }
      }
      return totalSize
    } catch {
      return 0
    }
  }
}

async function getDiskStats(mountPoint: string = "/"): Promise<{ total: number; used: number; free: number }> {
  try {
    // Use df command to get disk stats
    const { stdout } = await execAsync(`df -B1 "${mountPoint}" | tail -1`)
    const parts = stdout.trim().split(/\s+/)

    // df output: Filesystem 1B-blocks Used Available Use% Mounted
    const total = parseInt(parts[1]) || 0
    const used = parseInt(parts[2]) || 0
    const free = parseInt(parts[3]) || 0

    return {
      total: total / (1024 * 1024 * 1024), // Convert to GB
      used: used / (1024 * 1024 * 1024),
      free: free / (1024 * 1024 * 1024)
    }
  } catch {
    // Fallback for Windows or if df fails
    try {
      const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption')
      const lines = stdout.trim().split('\n').slice(1)
      let total = 0, free = 0

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 3) {
          free += parseInt(parts[1]) || 0
          total += parseInt(parts[2]) || 0
        }
      }

      return {
        total: total / (1024 * 1024 * 1024),
        used: (total - free) / (1024 * 1024 * 1024),
        free: free / (1024 * 1024 * 1024)
      }
    } catch {
      return { total: 0, used: 0, free: 0 }
    }
  }
}

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get default storage target
    const defaultTarget = await prisma.storageTarget.findFirst({
      where: { isDefault: true }
    })

    // Get backup path setting
    const backupPathSetting = await prisma.setting.findUnique({
      where: { key: "backupPath" }
    })

    // Determine backup folder path
    let backupFolderPath = "/backup" // Default path

    if (backupPathSetting?.value) {
      backupFolderPath = backupPathSetting.value
    } else if (defaultTarget) {
      try {
        const config = JSON.parse(defaultTarget.config)
        if (config.path) {
          backupFolderPath = config.path
        }
      } catch {
        // Keep default
      }
    }

    // Get disk stats for the backup folder's mount point
    const diskStats = await getDiskStats(backupFolderPath)

    // Get backup folder size
    const backupFolderGb = await getDirectorySize(backupFolderPath)

    const stats: DiskStats = {
      totalGb: Math.round(diskStats.total * 100) / 100,
      usedGb: Math.round(diskStats.used * 100) / 100,
      freeGb: Math.round(diskStats.free * 100) / 100,
      usedPercent: diskStats.total > 0 ? Math.round((diskStats.used / diskStats.total) * 100) : 0,
      backupFolderGb: Math.round(backupFolderGb * 100) / 100,
      backupFolderPath
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("Failed to get disk stats:", error)
    return NextResponse.json({
      totalGb: 0,
      usedGb: 0,
      freeGb: 0,
      usedPercent: 0,
      backupFolderGb: 0,
      backupFolderPath: "/backup",
      error: "Failed to get disk stats"
    })
  }
}
