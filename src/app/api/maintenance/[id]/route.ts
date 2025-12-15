import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { scheduleMaintenanceJob, unscheduleJob } from "@/lib/scheduler"

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

  const job = await prisma.maintenanceJob.update({
    where: { id },
    data: body
  })

  if (job.isEnabled) {
    scheduleMaintenanceJob(job.id, job.scheduleCron)
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

  unscheduleJob(id)

  await prisma.maintenanceJob.delete({
    where: { id }
  })

  return NextResponse.json({ message: "Job deleted successfully" })
}
