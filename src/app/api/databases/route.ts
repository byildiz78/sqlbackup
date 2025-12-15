import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const serverId = searchParams.get("serverId")
  const search = searchParams.get("search")

  const where: Record<string, unknown> = {}

  if (serverId) {
    where.serverId = serverId
  }

  if (search) {
    where.name = { contains: search }
  }

  const databases = await prisma.database.findMany({
    where,
    include: {
      server: {
        select: { id: true, name: true, host: true }
      },
      backupJobs: {
        where: { isEnabled: true },
        select: { backupType: true }
      },
      maintenanceJobs: {
        where: { isEnabled: true },
        select: { maintenanceType: true }
      },
      _count: {
        select: { backupJobs: true }
      }
    },
    orderBy: [{ server: { name: "asc" } }, { name: "asc" }]
  })

  // Transform to include job type flags
  const transformedDatabases = databases.map(db => {
    const backupTypes = db.backupJobs.map(j => j.backupType)
    const maintenanceTypes = db.maintenanceJobs.map(j => j.maintenanceType)

    return {
      ...db,
      hasFullBackup: backupTypes.includes("FULL"),
      hasDiffBackup: backupTypes.includes("DIFF"),
      hasLogBackup: backupTypes.includes("LOG"),
      hasIndexMaintenance: maintenanceTypes.includes("INDEX"),
      hasIntegrityCheck: maintenanceTypes.includes("INTEGRITY"),
      backupJobs: undefined, // Remove raw data
      maintenanceJobs: undefined
    }
  })

  return NextResponse.json(transformedDatabases)
}
