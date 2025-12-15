import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const dateParam = searchParams.get("date") // YYYY-MM-DD format

  // Default to today if no date provided (jobs run at night)
  const targetDate = dateParam ? new Date(dateParam) : new Date()

  // Create date range (start of day to end of day)
  const startOfDay = new Date(targetDate)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(targetDate)
  endOfDay.setHours(23, 59, 59, 999)

  try {
    // Fetch backup history for the date
    const backupHistory = await prisma.backupHistory.findMany({
      where: {
        startedAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        database: {
          include: {
            server: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { startedAt: "asc" }
    })

    // Fetch maintenance history for the date
    const maintenanceHistory = await prisma.maintenanceHistory.findMany({
      where: {
        startedAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        database: {
          include: {
            server: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { startedAt: "asc" }
    })

    // Fetch borg sync history for the date
    const borgSyncHistory = await prisma.borgSyncHistory.findMany({
      where: {
        startedAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      orderBy: { startedAt: "asc" }
    })

    // Fetch cleanup history for the date
    const cleanupHistory = await prisma.cleanupHistory.findMany({
      where: {
        startedAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      orderBy: { startedAt: "asc" }
    })

    // Calculate summary statistics
    const backupStats = {
      total: backupHistory.length,
      success: backupHistory.filter(b => b.status === "success").length,
      failed: backupHistory.filter(b => b.status === "failed").length,
      running: backupHistory.filter(b => b.status === "running").length,
      totalSizeMb: backupHistory.reduce((sum, b) => sum + (b.sizeMb || 0), 0),
      totalDuration: backupHistory.reduce((sum, b) => sum + (b.duration || 0), 0),
      byType: {
        FULL: backupHistory.filter(b => b.backupType === "FULL").length,
        DIFF: backupHistory.filter(b => b.backupType === "DIFF").length,
        LOG: backupHistory.filter(b => b.backupType === "LOG").length
      }
    }

    const maintenanceStats = {
      total: maintenanceHistory.length,
      success: maintenanceHistory.filter(m => m.status === "success").length,
      failed: maintenanceHistory.filter(m => m.status === "failed").length,
      running: maintenanceHistory.filter(m => m.status === "running").length,
      totalDuration: maintenanceHistory.reduce((sum, m) => sum + (m.duration || 0), 0),
      byType: {
        INDEX: maintenanceHistory.filter(m => m.maintenanceType === "INDEX").length,
        INTEGRITY: maintenanceHistory.filter(m => m.maintenanceType === "INTEGRITY").length,
        STATS: maintenanceHistory.filter(m => m.maintenanceType === "STATS").length
      }
    }

    const borgStats = {
      total: borgSyncHistory.length,
      success: borgSyncHistory.filter(s => s.status === "success").length,
      failed: borgSyncHistory.filter(s => s.status === "failed").length,
      running: borgSyncHistory.filter(s => s.status === "running").length,
      totalDuration: borgSyncHistory.reduce((sum, s) => sum + (s.duration || 0), 0),
      totalSizeOriginalMb: borgSyncHistory.reduce((sum, s) => sum + (s.sizeOriginal || 0), 0),
      totalSizeDeduplicatedMb: borgSyncHistory.reduce((sum, s) => sum + (s.sizeDeduplicated || 0), 0)
    }

    const cleanupStats = {
      total: cleanupHistory.length,
      success: cleanupHistory.filter(c => c.status === "success").length,
      failed: cleanupHistory.filter(c => c.status === "failed").length,
      running: cleanupHistory.filter(c => c.status === "running").length,
      totalDuration: cleanupHistory.reduce((sum, c) => sum + (c.duration || 0), 0),
      totalFilesDeleted: cleanupHistory.reduce((sum, c) => sum + (c.filesDeleted || 0), 0),
      totalSizeFreedMb: cleanupHistory.reduce((sum, c) => sum + (c.sizeMbFreed || 0), 0),
      dryRuns: cleanupHistory.filter(c => c.dryRun).length
    }

    // Transform data for timeline view
    const timeline = [
      ...backupHistory.map(b => ({
        id: b.id,
        type: "backup" as const,
        subType: b.backupType,
        databaseName: b.database.name,
        serverName: b.database.server.name,
        startedAt: b.startedAt,
        completedAt: b.completedAt,
        status: b.status,
        duration: b.duration,
        sizeMb: b.sizeMb,
        errorMsg: b.errorMsg
      })),
      ...maintenanceHistory.map(m => ({
        id: m.id,
        type: "maintenance" as const,
        subType: m.maintenanceType,
        databaseName: m.database.name,
        serverName: m.database.server.name,
        startedAt: m.startedAt,
        completedAt: m.completedAt,
        status: m.status,
        duration: m.duration,
        sizeMb: null,
        errorMsg: m.errorMsg
      })),
      ...borgSyncHistory.map(s => ({
        id: s.id,
        type: "borg" as const,
        subType: "SYNC",
        databaseName: null,
        serverName: null,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        status: s.status,
        duration: s.duration,
        sizeMb: s.sizeOriginal,
        errorMsg: s.errorMsg
      })),
      ...cleanupHistory.map(c => ({
        id: c.id,
        type: "cleanup" as const,
        subType: c.dryRun ? "DRY_RUN" : "DELETE",
        databaseName: null,
        serverName: null,
        startedAt: c.startedAt,
        completedAt: c.completedAt,
        status: c.status,
        duration: c.duration,
        sizeMb: c.sizeMbFreed,
        filesDeleted: c.filesDeleted,
        errorMsg: c.errorMsg
      }))
    ].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())

    // Get first and last job times
    const firstJob = timeline[0]
    const lastJob = timeline[timeline.length - 1]

    return NextResponse.json({
      date: targetDate.toISOString().split("T")[0],
      summary: {
        backup: backupStats,
        maintenance: maintenanceStats,
        borg: borgStats,
        cleanup: cleanupStats,
        overall: {
          total: backupStats.total + maintenanceStats.total + borgStats.total + cleanupStats.total,
          success: backupStats.success + maintenanceStats.success + borgStats.success + cleanupStats.success,
          failed: backupStats.failed + maintenanceStats.failed + borgStats.failed + cleanupStats.failed,
          running: backupStats.running + maintenanceStats.running + borgStats.running + cleanupStats.running
        },
        timeRange: {
          firstJobAt: firstJob?.startedAt || null,
          lastJobAt: lastJob?.completedAt || lastJob?.startedAt || null
        }
      },
      timeline,
      backupHistory,
      maintenanceHistory,
      borgSyncHistory,
      cleanupHistory
    })
  } catch (error) {
    console.error("Failed to fetch analytics:", error)
    return NextResponse.json(
      { error: "Failed to fetch analytics data" },
      { status: 500 }
    )
  }
}
