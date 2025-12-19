import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createConnectionFromServer, getDatabases } from "@/lib/mssql"
import { unscheduleJob } from "@/lib/scheduler"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get all servers
    const servers = await prisma.sqlServer.findMany()

    let totalAdded = 0
    let totalUpdated = 0
    let totalRemoved = 0
    let orphanedJobsRemoved = 0
    const errors: string[] = []

    // Sync each server
    for (const server of servers) {
      try {
        const pool = await createConnectionFromServer(server)
        const liveDatabases = await getDatabases(pool)
        await pool.close()

        const liveDbNames = new Set(liveDatabases.map(db => db.name))

        // Get current databases in our system for this server
        const existingDatabases = await prisma.database.findMany({
          where: { serverId: server.id }
        })

        // Update or add databases
        for (const db of liveDatabases) {
          const existing = existingDatabases.find(e => e.name === db.name)

          if (existing) {
            await prisma.database.update({
              where: { id: existing.id },
              data: {
                sizeMb: db.sizeMb,
                lastBackupFull: db.lastFullBackup,
                lastBackupDiff: db.lastDiffBackup,
                status: db.state.toLowerCase()
              }
            })
            totalUpdated++
          } else {
            await prisma.database.create({
              data: {
                serverId: server.id,
                name: db.name,
                sizeMb: db.sizeMb,
                lastBackupFull: db.lastFullBackup,
                lastBackupDiff: db.lastDiffBackup,
                status: db.state.toLowerCase()
              }
            })
            totalAdded++
          }
        }

        // Find databases that no longer exist on the server
        const removedDatabases = existingDatabases.filter(
          db => !liveDbNames.has(db.name)
        )

        // Remove orphaned databases and their jobs
        for (const db of removedDatabases) {
          // Get associated backup jobs
          const backupJobs = await prisma.backupJob.findMany({
            where: { databaseId: db.id }
          })

          // Unschedule and delete backup jobs
          for (const job of backupJobs) {
            unscheduleJob(job.id)
            orphanedJobsRemoved++
          }

          await prisma.backupJob.deleteMany({
            where: { databaseId: db.id }
          })

          // Get associated maintenance jobs
          const maintenanceJobs = await prisma.maintenanceJob.findMany({
            where: { databaseId: db.id }
          })

          // Unschedule and delete maintenance jobs
          for (const job of maintenanceJobs) {
            unscheduleJob(job.id)
            orphanedJobsRemoved++
          }

          await prisma.maintenanceJob.deleteMany({
            where: { databaseId: db.id }
          })

          // Delete the database record
          await prisma.database.delete({
            where: { id: db.id }
          })

          totalRemoved++
        }
      } catch (error) {
        const errorMsg = `Failed to sync ${server.name}: ${error instanceof Error ? error.message : "Unknown error"}`
        errors.push(errorMsg)
        console.error(errorMsg)
      }
    }

    return NextResponse.json({
      success: true,
      added: totalAdded,
      updated: totalUpdated,
      removed: totalRemoved,
      orphanedJobsRemoved,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error("Database sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    )
  }
}
