import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const limit = parseInt(searchParams.get("limit") || "50")
  const status = searchParams.get("status")
  const databaseId = searchParams.get("databaseId")

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (databaseId) where.databaseId = databaseId

  const history = await prisma.backupHistory.findMany({
    where,
    include: {
      database: {
        include: { server: { select: { name: true } } }
      },
      job: { select: { id: true, backupType: true } }
    },
    orderBy: { startedAt: "desc" },
    take: limit
  })

  return NextResponse.json(history)
}
