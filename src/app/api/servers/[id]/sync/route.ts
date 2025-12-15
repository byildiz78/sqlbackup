import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createConnectionFromServer, getDatabases } from "@/lib/mssql"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const server = await prisma.sqlServer.findUnique({
    where: { id }
  })

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 })
  }

  try {
    const pool = await createConnectionFromServer(server)
    const databases = await getDatabases(pool)
    await pool.close()

    let added = 0
    let updated = 0

    for (const db of databases) {
      const existing = await prisma.database.findUnique({
        where: {
          serverId_name: {
            serverId: server.id,
            name: db.name
          }
        }
      })

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
        updated++
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
        added++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sync completed. Added: ${added}, Updated: ${updated}`,
      totalDatabases: databases.length
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    )
  }
}
