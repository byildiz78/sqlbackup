import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { scheduleMaintenanceJob } from "@/lib/scheduler"

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

  const jobs = await prisma.maintenanceJob.findMany({
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
  const { databaseId, maintenanceType, scheduleCron, options } = body

  if (!databaseId || !maintenanceType || !scheduleCron) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const job = await prisma.maintenanceJob.create({
    data: {
      databaseId,
      maintenanceType,
      scheduleCron,
      options: options ? JSON.stringify(options) : null,
      isEnabled: true
    },
    include: {
      database: {
        include: { server: { select: { name: true } } }
      }
    }
  })

  // Schedule the job
  scheduleMaintenanceJob(job.id, job.scheduleCron)

  return NextResponse.json(job)
}
