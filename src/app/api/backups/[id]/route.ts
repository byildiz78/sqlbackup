import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { scheduleBackupJob, unscheduleJob } from "@/lib/scheduler"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const job = await prisma.backupJob.findUnique({
    where: { id },
    include: {
      database: {
        include: { server: true }
      },
      history: {
        orderBy: { startedAt: "desc" },
        take: 50
      }
    }
  })

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  return NextResponse.json(job)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const job = await prisma.backupJob.update({
    where: { id },
    data: body
  })

  // Reschedule if cron changed or enabled status changed
  if (job.isEnabled) {
    scheduleBackupJob(job.id, job.scheduleCron)
  } else {
    unscheduleJob(job.id)
  }

  return NextResponse.json(job)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  // Unschedule the job
  unscheduleJob(id)

  await prisma.backupJob.delete({
    where: { id }
  })

  return NextResponse.json({ message: "Job deleted successfully" })
}
