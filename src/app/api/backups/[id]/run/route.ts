import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { executeBackupJob } from "@/lib/scheduler"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  // Execute backup job in background
  executeBackupJob(id).catch(console.error)

  return NextResponse.json({ message: "Backup job started" })
}
