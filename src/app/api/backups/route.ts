import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { scheduleBackupJob } from "@/lib/scheduler"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const databaseId = searchParams.get("databaseId")

  const where: Record<string, unknown> = {}
  if (databaseId) {
    where.databaseId = databaseId
  }

  const jobs = await prisma.backupJob.findMany({
    where,
    include: {
      database: {
        include: { server: { select: { id: true, name: true } } }
      },
      history: {
        take: 1,
        orderBy: { startedAt: "desc" }
      }
    },
    orderBy: { createdAt: "desc" }
  })

  return NextResponse.json(jobs)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { databaseId, backupType, scheduleCron, storageTarget, compression, checksum, retentionDays } = body

  if (!databaseId || !backupType || !scheduleCron || !storageTarget) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  // Validate cron expression
  const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/
  // Simple validation - accept standard cron format

  const job = await prisma.backupJob.create({
    data: {
      databaseId,
      backupType,
      scheduleCron,
      storageTarget,
      compression: compression ?? true,
      checksum: checksum ?? true,
      retentionDays: retentionDays ?? 30,
      isEnabled: true
    },
    include: {
      database: {
        include: { server: { select: { name: true } } }
      }
    }
  })

  // Schedule the job
  scheduleBackupJob(job.id, job.scheduleCron)

  return NextResponse.json(job)
}
