import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { executeCleanup, analyzeCleanup } from "@/lib/disk-cleanup"

// POST - Run cleanup
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    if (dryRun) {
      // Just return analysis for dry run
      const analysis = await analyzeCleanup()
      return NextResponse.json({
        success: true,
        dryRun: true,
        deletedFiles: analysis.filesToDelete.length,
        deletedSizeMb: analysis.deleteSizeMb,
        errors: [],
        details: analysis.filesToDelete.map(f => ({
          filePath: f.filePath,
          databaseName: f.databaseName,
          backupType: f.backupType,
          date: f.date,
          sizeMb: f.sizeMb,
          deleted: false
        }))
      })
    }

    const result = await executeCleanup(false)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to run cleanup:", error)
    return NextResponse.json(
      { error: "Failed to run cleanup", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
