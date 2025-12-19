import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { unscheduleJob } from "@/lib/scheduler"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No job IDs provided" }, { status: 400 })
    }

    // Unschedule all jobs first
    for (const id of ids) {
      unscheduleJob(id)
    }

    // Delete all jobs
    const result = await prisma.maintenanceJob.deleteMany({
      where: {
        id: { in: ids }
      }
    })

    return NextResponse.json({
      deleted: result.count,
      message: `${result.count} job(s) deleted successfully`
    })
  } catch (error) {
    console.error("Bulk delete error:", error)
    return NextResponse.json({ error: "Failed to delete jobs" }, { status: 500 })
  }
}
