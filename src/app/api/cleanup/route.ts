import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCleanupStatus, saveCleanupSettings } from "@/lib/disk-cleanup"

// GET - Get cleanup status and analysis
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const status = await getCleanupStatus()
    return NextResponse.json(status)
  } catch (error) {
    console.error("Failed to get cleanup status:", error)
    return NextResponse.json(
      { error: "Failed to get cleanup status" },
      { status: 500 }
    )
  }
}

// POST - Update cleanup settings
export async function POST(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()

    await saveCleanupSettings({
      enabled: body.enabled,
      schedule: body.schedule,
      keepFullCount: body.keepFullCount,
      keepDiffPerFull: body.keepDiffPerFull,
      keepOrphanDiff: body.keepOrphanDiff
    })

    const status = await getCleanupStatus()
    return NextResponse.json(status)
  } catch (error) {
    console.error("Failed to save cleanup settings:", error)
    return NextResponse.json(
      { error: "Failed to save cleanup settings" },
      { status: 500 }
    )
  }
}
