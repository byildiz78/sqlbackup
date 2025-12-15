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

  const history = await prisma.maintenanceHistory.findMany({
    include: {
      database: {
        include: { server: { select: { name: true } } }
      }
    },
    orderBy: { startedAt: "desc" },
    take: limit
  })

  return NextResponse.json(history)
}
